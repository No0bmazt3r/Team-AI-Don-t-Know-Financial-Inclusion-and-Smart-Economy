import { beforeEach, expect, it } from 'vitest'
import { byKeyword, cache, candidates } from '../src/services/reco.ts'
import { db, schema } from '../src/db/index.ts'
import { fakeLlm, rider } from './helpers.ts'

beforeEach(() => cache.clear())

const base = { today: '2026-10-21', essentialsWeekSen: 45_000, usualWeekSen: 60_000, active: new Set<string>(), leavePlanned: false, isaraanLeftSen: 250_000, isaraanMatchSen: 50_000 }

it('suggests every addable pot with rule numbers, most urgent first, skipping ones already added', () => {
  const c = candidates(base)
  expect(c.map((x) => x.kind).sort()).toEqual(['cuti', 'isaraan', 'kecemasan', 'motor', 'raya'])
  const raya = c.find((x) => x.kind === 'raya')!
  expect(raya.weeks).toBe(20) // 2026-10-21 → 2027-03-10
  expect(raya.weeklySen * raya.weeks).toBeGreaterThanOrEqual(raya.targetSen)
  expect(c.find((x) => x.kind === 'kecemasan')!.targetSen).toBe(180_000) // four weeks of basics
  expect(candidates({ ...base, active: new Set(['raya', 'motor']), isaraanLeftSen: 0 }).map((x) => x.kind)).toEqual(['kecemasan', 'cuti'])
  const kinds = (leavePlanned: boolean) => candidates({ ...base, leavePlanned }).map((x) => x.kind)
  expect(kinds(true).indexOf('cuti')).toBeLessThan(kinds(true).indexOf('kecemasan')) // planned leave makes Cuti urgent
  expect(kinds(false)[0]).toBe('isaraan') // ten weeks left to claim this year's match
})

it('categorises custom pot names by keyword in BM and English', () => {
  expect(byKeyword('Kasut kerja')).toBe('work')
  expect(byKeyword('Yuran sekolah Aiman')).toBe('education')
  expect(byKeyword('New phone')).toBe('phone')
  expect(byKeyword('Zzz')).toBeNull()
})

it('adds a suggested pot and a custom one, closes a pot into the buffer, and keeps it as history', async () => {
  const a = await rider()
  let pots = (await a.get('/api/pots')).body.pots
  expect(pots.filter((p: { active: boolean }) => p.active).map((p: { kind: string }) => p.kind)).toEqual(['penampan', 'perkeso'])

  const s = (await a.get('/api/pots/suggestions')).body
  expect(s.source).toBe('rules')
  const raya = s.suggestions.find((x: { kind: string }) => x.kind === 'raya')
  expect(raya.reason).toContain(String(raya.weeks))

  expect((await a.post('/api/pots').send({ kind: 'raya', targetSen: raya.targetSen, weeklySen: raya.weeklySen })).status).toBe(201)
  const custom = (await a.post('/api/pots').send({ name: 'Kasut kerja', icon: 'briefcase', targetSen: 20_000, weeklySen: 2_500 })).body.pot
  expect(custom.kind).toMatch(/^c-/)
  expect((await a.get('/api/pots/suggestions')).body.suggestions.map((x: { kind: string }) => x.kind)).not.toContain('raya')
  expect((await a.post('/api/pots').send({ kind: 'penampan', targetSen: 0, weeklySen: 0 })).status).toBe(400)

  const preview = (await a.post('/api/pots/preview').send({ weeklySen: 5_000 })).body.preview
  expect(preview.newSalarySen).toBeLessThanOrEqual(preview.salarySen)

  // Money that's in the pot moves back to the buffer when it closes
  pots = (await a.get('/api/pots')).body.pots
  const { db, schema } = await import('../src/db/index.ts')
  const { eq } = await import('drizzle-orm')
  await db.update(schema.pots).set({ balanceSen: 7_000 }).where(eq(schema.pots.kind, custom.kind))
  const before = pots.find((p: { kind: string }) => p.kind === 'penampan').balanceSen
  expect((await a.post(`/api/pots/${custom.kind}/close`)).body.movedSen).toBe(7_000)
  pots = (await a.get('/api/pots')).body.pots
  expect(pots.find((p: { kind: string }) => p.kind === 'penampan').balanceSen).toBe(before + 7_000)
  expect(pots.find((p: { kind: string }) => p.kind === custom.kind)).toMatchObject({ active: false, balanceSen: 0, weeklySen: 0, name: 'Kasut kerja' })
  expect((await a.post('/api/pots/penampan/close')).status).toBe(400)
})

it('lets the AI order and word suggestions, but a reason with an invented number falls back to the rule', async () => {
  const a = await rider()
  const llm = fakeLlm()
  llm.reply = JSON.stringify({ items: [{ kind: 'motor', reason: 'Motor tu periuk nasi anda. Simpan sikit setiap minggu.' }, { kind: 'raya', reason: 'Raya nanti perlu RM9999.' }] })
  const s = (await a.get('/api/pots/suggestions')).body
  expect(s.source).toBe('ai')
  expect(s.suggestions[0]).toMatchObject({ kind: 'motor', reason: 'Motor tu periuk nasi anda. Simpan sikit setiap minggu.' })
  expect(s.suggestions[1].kind).toBe('raya')
  expect(s.suggestions[1].reason).not.toContain('9999')
  expect(s.suggestions).toHaveLength(5) // pots the AI skipped still appear, with rule reasons
})

it('asks the AI to categorise a name the keywords miss', async () => {
  const a = await rider()
  const llm = fakeLlm()
  llm.reply = JSON.stringify({ category: 'family' })
  expect((await a.post('/api/pots/classify').send({ name: 'Untuk Mia' })).body).toMatchObject({ category: 'family', icon: 'users', source: 'ai' })
  expect((await a.post('/api/pots/classify').send({ name: 'Servis motor' })).body).toMatchObject({ category: 'vehicle', source: 'rules' })
  expect(llm.requests).toHaveLength(1)
})

it('rebuilds the Penampan balance after each confirmed transfer, counting back from today', async () => {
  const a = await rider()
  const me = (await a.get('/api/auth/me')).body.user
  const userId = Number(me.id)
  const add = async (weekStart: string, amountSen: number) =>
    (await db.insert(schema.transfers).values({ userId, weekStart, direction: 'in', amountSen, allocation: {} }).returning())[0]!
  const t1 = await add('2026-09-07', 10_000)
  const t2 = await add('2026-09-14', 8_000)
  await add('2026-09-21', 4_000) // still pending: not on the chart
  await a.post(`/api/transfers/${t1.id}/confirm`).send({})
  await a.post(`/api/transfers/${t2.id}/confirm`).send({ amountSen: 5_000 }) // partial
  const before = (await a.get('/api/pots/penampan/history')).body.points
  const balance = (await a.get('/api/pots')).body.pots.find((p: { kind: string }) => p.kind === 'penampan').balanceSen
  expect(before).toEqual([
    { weekStart: '2026-09-07', balanceSen: balance - 5_000 },
    { weekStart: '2026-09-14', balanceSen: balance },
  ])
})
