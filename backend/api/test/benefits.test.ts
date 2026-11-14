import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { db, schema } from '../src/db/index.ts'
import { env } from '../src/env.ts'
import { addDays, addWeeks } from '../src/lib/weeks.ts'
import { demo, onboard, rider, THIS_WEEK } from './helpers.ts'

const userId = async (a: Awaited<ReturnType<typeof demo>>) => Number((await a.get('/api/auth/me')).body.user.id)

test('leave preview, then plan: set-aside goes to Cuti, cancel restores the salary', async () => {
  const a = await rider(Array(12).fill(70000))
  const before = (await a.get('/api/home')).body
  const raya = { label: 'Cuti Raya', startDate: addWeeks(THIS_WEEK, 5), endDate: addDays(addWeeks(THIS_WEEK, 5), 6) } // a whole Mon–Sun
  const p = (await a.post('/api/leave/preview').send(raya)).body
  expect(p.weeksUntil).toBe(5)
  expect(p.setAsideWeekSen).toBeGreaterThan(0)
  expect(p.setAsideWeekSen % 100).toBe(0)
  expect(p.salarySen).toBeLessThan(before.salary.salarySen)
  expect((await a.post('/api/leave').send(raya)).status).toBe(201)
  const after = (await a.get('/api/home')).body
  expect(after.salary.salarySen).toBe(p.salarySen)
  expect(after.transfer.allocation.cuti).toBe((before.transfer.allocation.cuti ?? 0) + p.setAsideWeekSen)
  const leaveId = (await a.get('/api/leave')).body.leave[0].id
  await a.delete(`/api/leave/${leaveId}`)
  expect((await a.get('/api/home')).body.salary.salarySen).toBe(before.salary.salarySen)
})

test('leave must be planned ahead, and is 1 to 28 days', async () => {
  const a = await rider()
  const start = addWeeks(THIS_WEEK, 2)
  expect((await a.post('/api/leave/preview').send({ startDate: addDays(THIS_WEEK, 3), endDate: addDays(THIS_WEEK, 4) })).status).toBe(422)
  expect((await a.post('/api/leave/preview').send({ startDate: start, endDate: addDays(start, 28) })).status).toBe(422) // 29 days
  expect((await a.post('/api/leave/preview').send({ startDate: start, endDate: addDays(start, -1) })).status).toBe(422)
})

test('leave by the day: three days cost about half a week, and the saved plan matches its preview', async () => {
  const a = await rider(Array(12).fill(70000))
  const mon = addWeeks(THIS_WEEK, 5)
  const week = (await a.post('/api/leave/preview').send({ startDate: mon, endDate: addDays(mon, 6) })).body
  const sat = addDays(mon, 5) // Sat, Sun, Mon: two weeks touched
  const three = { label: 'Kenduri', startDate: sat, endDate: addDays(sat, 2) }
  const p = (await a.post('/api/leave/preview').send(three)).body
  expect(p.days).toBe(3)
  expect(p.setAsideWeekSen).toBeLessThan(week.setAsideWeekSen)
  expect(p.setAsideWeekSen).toBeGreaterThan(week.setAsideWeekSen / 3)
  const made = (await a.post('/api/leave').send(three)).body.leave
  expect(made).toMatchObject({ startWeek: mon, weeks: 2, days: 3, startDate: sat, endDate: addDays(sat, 2) })
  expect((await a.get('/api/home')).body.salary.salarySen).toBe(p.salarySen)
})

test('a sick week is counted and freezes the streak', async () => {
  const a = await rider()
  expect((await a.post('/api/leave/sick').send({ days: 2 })).status).toBe(201)
  expect((await a.get('/api/leave')).body.sick).toEqual({ daysCovered: 3, daysUsed: 2 })
  const s = (await a.get('/api/streak')).body
  expect(s.frozenThisWeek).toBe(true)
  expect(s.weeks).toBe(12)
})

test('the i-Saraan match is capped per year', async () => {
  const a = await rider()
  env.ISARAAN_MATCH_CAP_SEN = 50_000
  let r = (await a.post('/api/caruman/isaraan').send({ amountSen: 100_000 })).body
  expect(r.matchSen).toBe(20_000)
  expect(r.governmentClaimedSen).toBe(20_000)
  r = (await a.post('/api/caruman/isaraan').send({ amountSen: 200_000 })).body
  expect(r.matchSen).toBe(30_000) // only what's left of the RM500 cap
  r = (await a.post('/api/caruman/isaraan').send({ amountSen: 100_000 })).body
  expect(r.matchSen).toBe(0)
  expect(r.isaraan.matchYearSen).toBe(50_000)
})

test('a check-in is due after a salary week', async () => {
  const a = await rider()
  expect((await a.get('/api/home')).body.checkinDue).toBeNull()
  const last = addWeeks(THIS_WEEK, -1)
  await db.insert(schema.transfers).values({ userId: await userId(a), weekStart: last, direction: 'in', amountSen: 100, allocation: { penampan: 100 } })
  expect((await a.get('/api/home')).body.checkinDue).toBe(last)
  await a.post('/api/checkins').send({ weekStart: last, answer: 'ya' })
  expect((await a.get('/api/home')).body.checkinDue).toBeNull()
  expect((await a.get('/api/streak')).body.gajiKept).toBe(1)
})

test('the streak counts back and survives a frozen gap', async () => {
  const a = await demo()
  await onboard(a)
  const week = (ago: number) => ({ weekStart: addWeeks(THIS_WEEK, -ago), platforms: [{ platform: 'grab', grossSen: 60000 }] })
  await a.post('/api/weeks/confirm').send({ weeks: [1, 2, 4, 5, 6].map(week) })
  expect((await a.get('/api/streak')).body.weeks).toBe(2) // 3 weeks ago is missing
  await a.post('/api/streak/freeze').send({ weekStart: addWeeks(THIS_WEEK, -1) })
  await db.insert(schema.streakFreezes).values({ userId: await userId(a), weekStart: addWeeks(THIS_WEEK, -3) }) // an older freeze
  const s = (await a.get('/api/streak')).body
  expect(s.weeks).toBe(5)
  expect(s.level).toBe(1)
  expect(s.accents).toEqual(['lime', 'aqua'])
})

test('the streak is at risk when last week is missing', async () => {
  const a = await demo()
  await onboard(a)
  await a.post('/api/weeks/confirm').send({ weeks: [2, 3].map((ago) => ({ weekStart: addWeeks(THIS_WEEK, -ago), platforms: [{ platform: 'grab', grossSen: 1 }] })) })
  const s = (await a.get('/api/streak')).body
  expect(s.weeks).toBe(2)
  expect(s.atRisk).toBe(true)
})

test('manual freezes are limited', async () => {
  const a = await rider()
  for (const ago of [0, 1]) expect((await a.post('/api/streak/freeze').send({ weekStart: addWeeks(THIS_WEEK, -ago) })).status).toBe(201)
  if ((await a.get('/api/streak')).body.freezesLeft === 0) {
    const r = await a.post('/api/streak/freeze').send({ weekStart: THIS_WEEK })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('no_freezes')
  }
})

test('badges come from real progress', async () => {
  const a = await rider(Array(12).fill(90000))
  let kinds = (await a.get('/api/streak')).body.badges.map((b: { kind: string }) => b.kind)
  expect(kinds).toEqual(expect.arrayContaining(['minggu_pertama', 'konsisten_4', 'konsisten_12']))
  expect(kinds).not.toContain('pindah_pertama')
  const t = (await a.get('/api/home')).body.transfer
  await a.post(`/api/transfers/${t.id}/confirm`).send({})
  kinds = (await a.get('/api/streak')).body.badges.map((b: { kind: string }) => b.kind)
  expect(kinds).toContain('pindah_pertama')
})

test('an accent must be unlocked first', async () => {
  const a = await demo()
  await onboard(a)
  const r = await a.patch('/api/me').send({ accent: 'sky' })
  expect(r.status).toBe(422)
  expect(r.body.error.code).toBe('accent_locked')
  expect((await a.patch('/api/me').send({ accent: 'lime' })).status).toBe(200)
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, await userId(a)))
  expect(u!.accent).toBe('lime')
})
