// Slip Gaji and Penyata figures. Every figure carries the weakest source label among the weeks behind it.
// The ML service renders them (HTML for the verify page, PDF via fpdf2) from the same labels.
import { and, eq, gte, lt } from 'drizzle-orm'
import type { User } from '../auth.ts'
import { type Db, schema } from '../db/index.ts'
import { env } from '../env.ts'
import { addDays, addWeeks, thisWeek, todayKL, weeksBetween } from '../lib/weeks.ts'

export const UNLOCK_WEEKS = 12 // uploaded history counts too
const RANK = { self: 0, checked: 1, verified: 2 } as const
type Source = keyof typeof RANK
const weakest = (sources: string[]): Source => (sources as Source[]).reduce<Source>((a, b) => (RANK[b] < RANK[a] ? b : a), 'verified')

export async function weeksLogged(db: Db, userId: number) {
  return (await db.selectDistinct({ w: schema.earnings.weekStart }).from(schema.earnings).where(eq(schema.earnings.userId, userId))).length
}

export type Months = 3 | 6 | 12

export async function statement(db: Db, user: User, months: Months) {
  const end = thisWeek()
  const start = addWeeks(end, -Math.round((months * 52) / 12))
  const rows = await db.select().from(schema.earnings).where(and(eq(schema.earnings.userId, user.id), gte(schema.earnings.weekStart, start), lt(schema.earnings.weekStart, end)))
  const byWeek = new Map<string, { net: number; gross: number; fees: number; source: Source; hours: number; sources: string[] }>()
  for (const e of rows) {
    const w = byWeek.get(e.weekStart) ?? { net: 0, gross: 0, fees: 0, source: 'verified', hours: 0, sources: [] }
    w.net += e.grossSen - e.commissionSen + e.incentivesSen + e.tipsSen
    w.gross += e.grossSen + e.incentivesSen + e.tipsSen
    w.fees += e.commissionSen
    w.hours += e.hoursOnline ?? 0
    w.sources.push(e.verification)
    byWeek.set(e.weekStart, w)
  }
  const weekly = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, w]) => ({ week, ...w, source: weakest(w.sources) }))
  const byMonth = new Map<string, typeof weekly>()
  for (const w of weekly) byMonth.set(w.week.slice(0, 7), [...(byMonth.get(w.week.slice(0, 7)) ?? []), w])
  const nets = weekly.map((w) => w.net)
  const half = Math.floor(nets.length / 2)
  let trend: 'up' | 'down' | 'flat' = 'flat'
  if (half >= 2) {
    const a = nets.slice(0, half).reduce((x, y) => x + y, 0) / half
    const b = nets.slice(half).reduce((x, y) => x + y, 0) / (nets.length - half)
    trend = b > a * 1.05 ? 'up' : b < a * 0.95 ? 'down' : 'flat'
  }
  return {
    from: start,
    to: addDays(end, -1),
    weeks: weekly.length,
    months,
    monthly: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, ws]) => ({
        year: Number(ym.slice(0, 4)),
        month: Number(ym.slice(5, 7)),
        weeks: ws.length,
        grossSen: ws.reduce((x, w) => x + w.gross, 0),
        feesSen: ws.reduce((x, w) => x + w.fees, 0),
        netSen: ws.reduce((x, w) => x + w.net, 0),
        avgSen: Math.floor(ws.reduce((x, w) => x + w.net, 0) / ws.length),
        hours: Math.round(ws.reduce((x, w) => x + w.hours, 0)),
        source: weakest(ws.map((w) => w.source)),
      })),
    avgSen: nets.length ? Math.floor(nets.reduce((x, y) => x + y, 0) / nets.length) : 0,
    minSen: nets.length ? Math.min(...nets) : 0,
    maxSen: nets.length ? Math.max(...nets) : 0,
    trend,
    platforms: [...new Set(rows.map((e) => e.platform))].sort(),
    source: weekly.length ? weakest(weekly.map((w) => w.source)) : ('self' as Source),
    totals: {
      grossSen: weekly.reduce((x, w) => x + w.gross, 0),
      feesSen: weekly.reduce((x, w) => x + w.fees, 0),
      netSen: nets.reduce((x, y) => x + y, 0),
    },
    contributions: await contributionsIn(db, user.id, start, addDays(end, -1), weekly.reduce((x, w) => x + w.gross, 0)),
  }
}

/** i-Saraan paid in a date range, and PERKESO: deducted by the platform, or our estimate on gross if not. */
async function contributionsIn(db: Db, userId: number, from: string, to: string, grossSen: number) {
  const rows = await db.select().from(schema.contributions).where(eq(schema.contributions.userId, userId))
  const inRange = rows.filter((r) => { const d = r.createdAt.toISOString().slice(0, 10); return d >= from && d <= to })
  return {
    isaraanSen: inRange.reduce((a, r) => a + r.amountSen, 0),
    isaraanMatchSen: inRange.reduce((a, r) => a + r.matchSen, 0),
    perkesoDeducted: env.PERKESO_DEDUCTED_AT_SOURCE,
    perkesoSen: Math.round(grossSen * env.PERKESO_RATE),
  }
}

// How each cost category reads for Borang B. "Business" is likely a business cost, never "deductible": the rider
// or their tax agent decides. The bike instalment buys an asset, so it's shown apart (capital allowance, not a cost).
export const TAX_GROUP = {
  business: ['minyak', 'servis', 'telefon', 'parking', 'tol', 'motor_tahunan'],
  asset: ['ansuran'],
  personal: ['makan', 'sewa', 'keluarga', 'lain'],
} as const

/** A calendar year of the rider's own records, laid out for Borang B. A week belongs to the year its Monday is in. */
export async function taxYear(db: Db, user: User, year: number) {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const rows = await db.select().from(schema.earnings).where(and(eq(schema.earnings.userId, user.id), gte(schema.earnings.weekStart, from), lt(schema.earnings.weekStart, `${year + 1}-01-01`)))
  const costs = await db.select().from(schema.expenses).where(and(eq(schema.expenses.userId, user.id), gte(schema.expenses.weekStart, from), lt(schema.expenses.weekStart, `${year + 1}-01-01`)))
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = rows.filter((e) => Number(e.weekStart.slice(5, 7)) === i + 1)
    return {
      month: i + 1,
      weeks: new Set(m.map((e) => e.weekStart)).size,
      faresSen: m.reduce((a, e) => a + e.grossSen, 0),
      extrasSen: m.reduce((a, e) => a + e.incentivesSen + e.tipsSen, 0),
      feesSen: m.reduce((a, e) => a + e.commissionSen, 0),
      netSen: m.reduce((a, e) => a + e.grossSen - e.commissionSen + e.incentivesSen + e.tipsSen, 0),
      source: m.length ? weakest(m.map((e) => e.verification)) : null,
    }
  })
  const sum = (k: 'faresSen' | 'extrasSen' | 'feesSen' | 'netSen') => months.reduce((a, m) => a + m[k], 0)
  const byCategory = new Map<string, number>()
  for (const c of costs) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.amountSen)
  const group = (cats: readonly string[]) => {
    const items = cats.filter((c) => byCategory.has(c)).map((c) => ({ category: c, amountSen: byCategory.get(c)! }))
    return { items, totalSen: items.reduce((a, x) => a + x.amountSen, 0) }
  }
  const today = todayKL()
  const weeksPossible = Number(today.slice(0, 4)) === year ? Math.min(52, Math.ceil(weeksBetween(from, today) + 1)) : 52
  const contribRows = (await db.select().from(schema.contributions).where(eq(schema.contributions.userId, user.id))).filter((r) => r.year === year)
  const receiptsSen = sum('faresSen') + sum('extrasSen')
  const business = group(TAX_GROUP.business)
  return {
    year,
    from,
    to,
    weeks: new Set(rows.map((e) => e.weekStart)).size,
    weeksPossible,
    platforms: [...new Set(rows.map((e) => e.platform))].sort(),
    source: rows.length ? weakest(rows.map((e) => e.verification)) : ('self' as Source),
    monthly: months.filter((m) => m.weeks > 0),
    totals: { faresSen: sum('faresSen'), extrasSen: sum('extrasSen'), receiptsSen, feesSen: sum('feesSen'), netSen: sum('netSen') },
    costs: { business, asset: group(TAX_GROUP.asset), personal: group(TAX_GROUP.personal), recordedWeeks: new Set(costs.map((c) => c.weekStart)).size },
    // Platform net minus likely business costs: a starting point for Borang B, not the taxable figure.
    afterBusinessCostsSen: sum('netSen') - business.totalSen,
    contributions: {
      isaraanSen: contribRows.reduce((a, r) => a + r.amountSen, 0),
      isaraanMatchSen: contribRows.reduce((a, r) => a + r.matchSen, 0),
      perkesoDeducted: env.PERKESO_DEDUCTED_AT_SOURCE,
      perkesoSen: Math.round(receiptsSen * env.PERKESO_RATE),
    },
  }
}

/** Years the rider has earnings in, newest first, with how many weeks each. */
export async function taxYears(db: Db, userId: number) {
  const weeks = await db.selectDistinct({ w: schema.earnings.weekStart }).from(schema.earnings).where(eq(schema.earnings.userId, userId))
  const count = new Map<number, number>()
  for (const { w } of weeks) count.set(Number(w.slice(0, 4)), (count.get(Number(w.slice(0, 4))) ?? 0) + 1)
  return [...count.entries()].sort(([a], [b]) => b - a).map(([year, n]) => ({ year, weeks: n }))
}

/** A weekly payslip: what came in for the week, and what happened on the payday after it. */
export async function payslip(db: Db, user: User, week: string) {
  const payday = addWeeks(week, 1)
  const earnings = await db.select().from(schema.earnings).where(and(eq(schema.earnings.userId, user.id), eq(schema.earnings.weekStart, week)))
  const costs: Record<string, number> = {}
  for (const x of await db.select().from(schema.expenses).where(and(eq(schema.expenses.userId, user.id), eq(schema.expenses.weekStart, week)))) {
    costs[x.category] = (costs[x.category] ?? 0) + x.amountSen
  }
  const [run] = await db.select().from(schema.salaryRuns).where(and(eq(schema.salaryRuns.userId, user.id), eq(schema.salaryRuns.weekStart, payday)))
  const [t] = await db.select().from(schema.transfers).where(and(eq(schema.transfers.userId, user.id), eq(schema.transfers.weekStart, payday)))
  const gross = earnings.reduce((a, e) => a + e.grossSen, 0)
  return {
    weekStart: week,
    platforms: earnings.map((e) => ({
      platform: e.platform,
      grossSen: e.grossSen,
      commissionSen: e.commissionSen,
      incentivesSen: e.incentivesSen,
      tipsSen: e.tipsSen,
      netSen: e.grossSen - e.commissionSen + e.incentivesSen + e.tipsSen,
      hoursOnline: e.hoursOnline,
      trips: e.trips,
      verification: e.verification,
    })),
    netSen: earnings.reduce((a, e) => a + e.grossSen - e.commissionSen + e.incentivesSen + e.tipsSen, 0),
    costs,
    salarySen: run?.salarySen ?? null,
    perkeso: { deductedAtSource: env.PERKESO_DEDUCTED_AT_SOURCE, estimateSen: Math.round(gross * env.PERKESO_RATE) },
    transfer: t ? { direction: t.direction, amountSen: t.amountSen, status: t.status, allocation: t.allocation } : null,
  }
}
