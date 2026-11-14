// Loads a rider's data, asks the engine, and saves the result.
import { createHash } from 'node:crypto'
import { and, asc, desc, eq, gte, lt, ne } from 'drizzle-orm'
import { type Db, schema } from '../db/index.ts'
import type { EngineResult } from '../db/schema.ts'
import { env } from '../env.ts'
import { addWeeks, leaveParts, thisWeek } from '../lib/weeks.ts'
import { type Inputs, ml, type Scenario } from '../ml.ts'
import { ensurePots } from './pots.ts'
import type { User } from '../auth.ts'

/** Same rider + same week = the same 1,000 futures, so the salary doesn't jitter on reload. */
export const seedFor = (userId: number, week: string) => Number(BigInt('0x' + createHash('sha256').update(`${userId}:${week}`).digest('hex').slice(0, 13)))

export type WeekTotal = { weekStart: string; netSen: number; hours: number | null }

/** Net and hours per logged week, oldest first, platforms combined. */
export async function weeklyHistory(db: Db, userId: number): Promise<WeekTotal[]> {
  const rows = await db.select().from(schema.earnings).where(eq(schema.earnings.userId, userId)).orderBy(asc(schema.earnings.weekStart))
  const weeks = new Map<string, WeekTotal>()
  for (const e of rows) {
    const w = weeks.get(e.weekStart) ?? { weekStart: e.weekStart, netSen: 0, hours: null }
    w.netSen += e.grossSen - e.commissionSen + e.incentivesSen + e.tipsSen
    if (e.hoursOnline !== null) w.hours = (w.hours ?? 0) + e.hoursOnline
    weeks.set(e.weekStart, w)
  }
  return [...weeks.values()]
}

export async function platformsOf(db: Db, userId: number): Promise<string[]> {
  const rows = await db.select({ p: schema.userPlatforms.platform }).from(schema.userPlatforms).where(eq(schema.userPlatforms.userId, userId)).orderBy(asc(schema.userPlatforms.id))
  return rows.map((r) => r.p)
}

/** A weekly set-aside into Cuti that pays for the sick days covered. A day is a sixth of a week's essentials. */
export const sickReserve = (user: User) => Math.round(((user.essentialsWeekSen ?? 0) / 6) * (user.sickDaysCovered / 52))

/** Only reserved when platforms don't already deduct it at source. */
export const perkesoReserve = (netSen: number) => (env.PERKESO_DEDUCTED_AT_SOURCE ? 0 : Math.round(env.PERKESO_RATE * netSen))

/** The week whose salary the rider is on: the week after the latest logged week, but never in the past. */
export async function currentWeek(db: Db, userId: number): Promise<string> {
  const history = await weeklyHistory(db, userId)
  const now = thisWeek()
  const next = history.length ? addWeeks(history.at(-1)!.weekStart, 1) : now
  return next > now ? next : now
}

/** Inputs for the salary of runWeek, whose payday brings in the week before it. null = nothing logged yet. */
export async function buildInputs(db: Db, user: User, runWeek: string): Promise<Inputs | null> {
  const history = (await weeklyHistory(db, user.id)).filter((h) => h.weekStart < runWeek)
  if (!history.length) return null
  const lastWeek = addWeeks(runWeek, -1)
  const lastNet = history.find((h) => h.weekStart === lastWeek)?.netSen ?? 0
  const pots = await ensurePots(db, user.id)
  const bills = await db.select().from(schema.bills).where(and(eq(schema.bills.userId, user.id), eq(schema.bills.active, true)))
  const leaves = await db
    .select()
    .from(schema.leavePlans)
    .where(and(eq(schema.leavePlans.userId, user.id), ne(schema.leavePlans.status, 'cancelled'), gte(schema.leavePlans.startWeek, addWeeks(runWeek, -13))))
  const reserves =
    Object.values(pots)
      .filter((p) => p.kind !== 'penampan')
      .reduce((a, p) => a + p.weeklySen, 0) +
    perkesoReserve(lastNet) +
    sickReserve(user)
  return {
    weekStart: runWeek,
    lastWeekNetSen: lastNet,
    history: history.map((h) => ({ netSen: h.netSen, hours: h.hours, weekStart: h.weekStart })),
    platforms: await platformsOf(db, user.id),
    city: user.city,
    defaultHours: user.defaultHours,
    bufferSen: pots.penampan.balanceSen,
    cutiSen: pots.cuti.balanceSen,
    bills: bills.map((b) => ({ name: b.name, amountSen: b.amountSen, frequency: b.frequency, dueDay: b.dueDay, dueDate: b.dueDate })),
    // Leave picked by the day becomes one entry per week it touches (that week's share off); the set-aside rides on
    // the first so it's counted once. Older plans are whole weeks; sick weeks use their days.
    leaves: leaves.flatMap((l) =>
      l.startDate && l.endDate
        ? leaveParts(l.startDate, l.endDate).map((p, i) => ({ startWeek: p.week, weeks: 1, setAsideWeekSen: i ? 0 : l.setAsideWeekSen, fraction: p.fraction }))
        : [{ startWeek: l.startWeek, weeks: l.weeks, setAsideWeekSen: l.setAsideWeekSen, fraction: (l.days ?? 6) / 6 }],
    ),
    essentialsWeekSen: user.essentialsWeekSen ?? 0,
    reservesWeekSen: reserves,
    seed: seedFor(user.id, runWeek),
  }
}

export async function runScenario(db: Db, user: User, scenario: Scenario = {}) {
  const inputs = await buildInputs(db, user, await currentWeek(db, user.id))
  return inputs ? { inputs, result: await ml.solve(inputs, scenario) } : null
}

/** Re-run the salary for the current week, keep the explanation, and refresh this week's transfer. */
export async function recompute(db: Db, user: User) {
  const runWeek = await currentWeek(db, user.id)
  const inputs = await buildInputs(db, user, runWeek)
  if (!inputs) return null
  const [prev] = await db
    .select()
    .from(schema.salaryRuns)
    .where(and(eq(schema.salaryRuns.userId, user.id), lt(schema.salaryRuns.weekStart, runWeek)))
    .orderBy(desc(schema.salaryRuns.weekStart))
    .limit(1)
  const result: EngineResult = await ml.solve(inputs, {}, prev ? { ...prev.result, salarySen: prev.salarySen } : null)
  result.salaryDeltaSen = prev ? result.salarySen - prev.salarySen : null
  const row = { salarySen: result.salarySen, pSafe: result.pSafe, risk: result.risk, bufferStartSen: inputs.bufferSen, result, modelVersion: result.modelVersion, seed: String(inputs.seed) }
  await db
    .insert(schema.salaryRuns)
    .values({ userId: user.id, weekStart: runWeek, ...row })
    .onConflictDoUpdate({ target: [schema.salaryRuns.userId, schema.salaryRuns.weekStart], set: row })
  await refreshTransfer(db, user, runWeek, result, perkesoReserve(inputs.lastWeekNetSen), sickReserve(user))
  return result
}

/** A confirmed transfer is history and is never rewritten; a pending one follows the latest run. */
async function refreshTransfer(db: Db, user: User, week: string, res: EngineResult, perkesoSen: number, sickSen: number) {
  const [t] = await db.select().from(schema.transfers).where(and(eq(schema.transfers.userId, user.id), eq(schema.transfers.weekStart, week)))
  if (t && t.status !== 'pending') return
  const pots = await ensurePots(db, user.id)
  const allocation: Record<string, number> = {}
  for (const p of Object.values(pots)) if (p.kind !== 'penampan' && p.weeklySen) allocation[p.kind] = p.weeklySen
  if (perkesoSen) allocation.perkeso = (allocation.perkeso ?? 0) + perkesoSen
  if (sickSen) allocation.cuti = (allocation.cuti ?? 0) + sickSen
  const sum = () => Object.values(allocation).reduce((a, b) => a + b, 0)
  const leaveSetAside = res.reservesThisWeekSen - sum()
  if (leaveSetAside || res.fromCutiSen) allocation.cuti = (allocation.cuti ?? 0) + leaveSetAside - res.fromCutiSen
  allocation.penampan = res.transferSen - sum()
  if (res.transferSen === 0) {
    if (t) await db.delete(schema.transfers).where(eq(schema.transfers.id, t.id))
    return
  }
  const values = { direction: res.transferSen > 0 ? 'in' : 'out', amountSen: Math.abs(res.transferSen), allocation: Object.fromEntries(Object.entries(allocation).filter(([, v]) => v)) }
  if (t) await db.update(schema.transfers).set(values).where(eq(schema.transfers.id, t.id))
  else await db.insert(schema.transfers).values({ userId: user.id, weekStart: week, ...values })
}
