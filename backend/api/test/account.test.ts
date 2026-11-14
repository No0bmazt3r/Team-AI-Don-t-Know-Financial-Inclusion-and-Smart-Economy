import { expect, test } from 'vitest'
import { db, schema } from '../src/db/index.ts'
import { addDays, addWeeks } from '../src/lib/weeks.ts'
import { parseStatement } from '../src/services/statement.ts'
import { demo, logHistory, onboard, pdf, rider, THIS_WEEK } from './helpers.ts'

/** A minimal one-page PDF with one text line per entry (Helvetica), enough for pypdf to read. */
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

test('export has everything about the rider and no secrets', async () => {
  const a = await rider()
  await a.get('/api/penyata.pdf') // makes a verify code
  const r = await a.get('/api/me/export')
  expect(r.headers['content-disposition']).toMatch(/attachment; filename="coinvoy-data-/)
  expect(r.body.earnings).toHaveLength(12)
  expect(r.body.salaryRuns).toHaveLength(1)
  expect(r.body.profile.googleSub).toBeUndefined()
  expect(r.body.verifyCodes).toHaveLength(1)
  expect(r.body.verifyCodes[0].codeHash).toBeUndefined()
})

test('delete needs the word PADAM, then removes every row', async () => {
  const a = await rider()
  expect((await a.delete('/api/me').send({ confirm: 'ya' })).status).toBe(422)
  expect((await a.delete('/api/me').send({ confirm: 'PADAM' })).status).toBe(204)
  expect((await a.get('/api/auth/me')).status).toBe(401)
  for (const t of [schema.users, schema.earnings, schema.salaryRuns, schema.transfers, schema.pots, schema.sessions]) expect(await db.select().from(t)).toEqual([])
})

test('statement lines become dated payouts and pocket moves', () => {
  const e = parseStatement([
    '13/10/2026 GRAB PAYOUT MY 401.25 1,203.50',
    '14 Oct 2026 Transfer to Saving Pocket RM 113.00',
    '2026-10-15 FOODPANDA DELIVERY HERO 230.10',
    '15/10/2026 KEDAI MAKAN 12.00',
  ])
  expect(e).toEqual([
    { date: '2026-10-13', sen: 40125, platform: 'grab', pocket: false },
    { date: '2026-10-14', sen: 11300, platform: null, pocket: true },
    { date: '2026-10-15', sen: 23010, platform: 'foodpanda', pocket: false },
  ])
})

test('a statement PDF cross-checks matching weeks and transfers', async () => {
  const a = await demo()
  await onboard(a)
  await logHistory(a, [60000, 58000])
  const t = (await a.get('/api/home')).body.transfer
  await a.post(`/api/transfers/${t.id}/confirm`).send({})
  const lastWeek = addWeeks(THIS_WEEK, -1)
  const file = pdf([`${dmy(addDays(THIS_WEEK, 1))} GRAB PAYOUT 580.00 900.00`, `${dmy(addDays(THIS_WEEK, 1))} TRANSFER TO SAVINGS POCKET ${(t.amountSen / 100).toFixed(2)}`, 'nothing else here'])
  const r = await a.post('/api/statement').attach('file', file, 'statement.pdf')
  expect(r.status, r.text).toBe(200)
  expect(r.body).toMatchObject({ weeksChecked: 1, transfersChecked: 1 })
  const weeks = (await a.get('/api/weeks')).body.weeks
  expect(weeks.find((w: { weekStart: string }) => w.weekStart === lastWeek).verification).toBe('checked')
  expect(weeks.find((w: { weekStart: string }) => w.weekStart !== lastWeek).verification).toBe('self')
  expect((await a.get('/api/home')).body.transfer.verification).toBe('checked')
  expect((await a.post('/api/statement').attach('file', Buffer.from('not a pdf'), 'x.pdf')).status).toBe(415)
})

test('Indeks Rider shows nothing until 20 consenting riders share a group', async () => {
  const join = async (n: number) => {
    for (let i = 0; i < n; i++) {
      const r = await demo()
      await onboard(r)
      await r.post('/api/consents').send({ kind: 'indeks_rider', version: '2026-10', granted: true })
      await logHistory(r, [50000])
    }
  }
  await join(19)
  const me = await rider([50000])
  expect((await me.get('/api/index')).body.groups.find((g: { platform: string }) => g.platform === 'grab').riders).toBeNull() // I didn't consent
  await join(1)
  const grab = (await me.get('/api/index')).body.groups.find((g: { platform: string }) => g.platform === 'grab')
  expect(grab.riders).toBe(20)
  expect(grab.medianSenPerHour).toBe(Math.round(50000 / 45))
  expect(await db.select().from(schema.indexContributions).then((rows) => rows.every((r) => !('userId' in r)))).toBe(true)
})
