// Cuti, Caruman, check-ins and streaks.
import { and, desc, eq, ne } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireUser, userOf } from '../auth.ts'
import { db, schema } from '../db/index.ts'
import { ApiError, notFound } from '../errors.ts'
import { addWeeks, isMonday, leaveParts, thisWeek, weekStart, weeksBetween } from '../lib/weeks.ts'
import { ml } from '../ml.ts'
import { caruman, contributeIsaraan, refreshBadges, sickStatus, streak } from '../services/benefits.ts'
import { buildInputs, currentWeek, recompute } from '../services/salary.ts'
import { MAX_SEN } from '../lib/limits.ts'

const MAX_LEAVE_DAYS = 28
const LeaveIn = z.strictObject({ label: z.string().max(40).nullable().optional(), startDate: z.iso.date(), endDate: z.iso.date() })
const leaveJson = (l: typeof schema.leavePlans.$inferSelect) => ({ id: l.id, kind: l.kind, label: l.label, startWeek: l.startWeek, weeks: l.weeks, days: l.days, startDate: l.startDate, endDate: l.endDate, setAsideWeekSen: l.setAsideWeekSen, status: l.status })
const bad = (code: string, ms: string, en: string) => new ApiError(422, code, ms, en)

export const benefitsRouter = Router()
benefitsRouter.use(requireUser)

// Leave by the day: the first day is in a later week than this one (time to set aside), within a year, at most 28 days.
async function preview(res: Parameters<typeof userOf>[0], body: z.infer<typeof LeaveIn>) {
  const user = userOf(res)
  const runWeek = await currentWeek(db, user.id)
  const days = Math.round((Date.parse(body.endDate) - Date.parse(body.startDate)) / 86_400_000) + 1
  if (days < 1 || days > MAX_LEAVE_DAYS) throw bad('bad_leave_days', `Pilih antara 1 dan ${MAX_LEAVE_DAYS} hari.`, `Pick between 1 and ${MAX_LEAVE_DAYS} days.`)
  const until = weeksBetween(runWeek, weekStart(body.startDate))
  if (until < 1 || until > 52) throw bad('bad_leave_week', 'Rancang cuti sekurang-kurangnya seminggu lebih awal, dalam tempoh setahun.', 'Plan leave at least a week ahead, within a year.')
  const inputs = await buildInputs(db, user, runWeek)
  if (!inputs) throw bad('no_salary_yet', 'Snap pendapatan dahulu.', 'Snap your earnings first.')
  const parts = leaveParts(body.startDate, body.endDate)
  return { user, days, parts, p: await ml.leavePreview(inputs, parts.map(({ week, fraction }) => ({ week, fraction }))) }
}

benefitsRouter.post('/leave/preview', async (req, res) => {
  const { days, p } = await preview(res, LeaveIn.parse(req.body))
  res.json({ ...p, days })
})

benefitsRouter.post('/leave', async (req, res) => {
  const body = LeaveIn.parse(req.body)
  const { user, days, parts, p } = await preview(res, body)
  const [leave] = await db
    .insert(schema.leavePlans)
    .values({ userId: user.id, kind: 'planned', label: body.label ?? null, startWeek: parts[0]!.week, weeks: parts.length, days, startDate: body.startDate, endDate: body.endDate, setAsideWeekSen: p.setAsideWeekSen })
    .returning()
  await recompute(db, user)
  res.status(201).json({ leave: leaveJson(leave!) })
})

// "Saya sakit minggu ini": the Cuti pot pays for the days off, and the streak freezes.
benefitsRouter.post('/leave/sick', async (req, res) => {
  const { days } = z.strictObject({ days: z.number().int().min(1).max(6) }).parse(req.body)
  const user = userOf(res)
  const week = thisWeek()
  const [existing] = await db
    .select()
    .from(schema.leavePlans)
    .where(and(eq(schema.leavePlans.userId, user.id), eq(schema.leavePlans.kind, 'sick'), eq(schema.leavePlans.startWeek, week), ne(schema.leavePlans.status, 'cancelled')))
  const [leave] = existing
    ? await db.update(schema.leavePlans).set({ days }).where(eq(schema.leavePlans.id, existing.id)).returning()
    : await db.insert(schema.leavePlans).values({ userId: user.id, kind: 'sick', startWeek: week, weeks: 1, days }).returning()
  await db.insert(schema.events).values({ userId: user.id, name: 'sick_week', props: { days } })
  await recompute(db, user)
  res.status(201).json({ leave: leaveJson(leave!) })
})

benefitsRouter.get('/leave', async (_req, res) => {
  const user = userOf(res)
  const rows = await db.select().from(schema.leavePlans).where(and(eq(schema.leavePlans.userId, user.id), ne(schema.leavePlans.status, 'cancelled'))).orderBy(desc(schema.leavePlans.startWeek))
  res.json({ leave: rows.map(leaveJson), sick: await sickStatus(db, user) })
})

benefitsRouter.delete('/leave/:id', async (req, res) => {
  const user = userOf(res)
  const [l] = await db.select().from(schema.leavePlans).where(and(eq(schema.leavePlans.id, z.coerce.number().int().parse(req.params.id)), eq(schema.leavePlans.userId, user.id)))
  if (!l) throw notFound()
  await db.update(schema.leavePlans).set({ status: 'cancelled' }).where(eq(schema.leavePlans.id, l.id))
  await recompute(db, user)
  res.status(204).end()
})

benefitsRouter.get('/caruman', async (_req, res) => {
  res.json(await caruman(db, userOf(res)))
})

benefitsRouter.post('/caruman/isaraan', async (req, res) => {
  const { amountSen } = z.strictObject({ amountSen: z.number().int().positive().max(MAX_SEN) }).parse(req.body)
  const user = userOf(res)
  const matchSen = await contributeIsaraan(db, user, amountSen)
  await db.insert(schema.events).values({ userId: user.id, name: 'isaraan_match_earned', props: { match_sen: matchSen } })
  res.status(201).json({ matchSen, ...(await caruman(db, user)) })
})

benefitsRouter.post('/checkins', async (req, res) => {
  const { weekStart, answer } = z.strictObject({ weekStart: z.iso.date(), answer: z.enum(['ya', 'hampir', 'tak_cukup']) }).parse(req.body)
  const user = userOf(res)
  await db
    .insert(schema.checkins)
    .values({ userId: user.id, weekStart, answer })
    .onConflictDoUpdate({ target: [schema.checkins.userId, schema.checkins.weekStart], set: { answer } })
  await db.insert(schema.events).values({ userId: user.id, name: 'checkin', props: { answer } })
  res.json({ ok: true })
})

benefitsRouter.get('/streak', async (_req, res) => {
  const user = userOf(res)
  const s = await streak(db, user)
  res.json({ ...s, badges: await refreshBadges(db, user, s.weeks) })
})

benefitsRouter.post('/streak/freeze', async (req, res) => {
  const { weekStart } = z.strictObject({ weekStart: z.iso.date() }).parse(req.body)
  const user = userOf(res)
  const now = thisWeek()
  if (!isMonday(weekStart) || weekStart < addWeeks(now, -1) || weekStart > now) throw bad('bad_week', 'Hanya minggu ini atau minggu lepas.', 'Only this week or last week.')
  if ((await streak(db, user)).freezesLeft < 1) throw bad('no_freezes', 'Tiada pembekuan lagi suku tahun ini.', 'No freezes left this quarter.')
  await db.insert(schema.streakFreezes).values({ userId: user.id, weekStart }).onConflictDoNothing()
  res.status(201).json(await streak(db, user))
})
