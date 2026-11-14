import { expect, test } from 'vitest'
import { addWeeks } from '../src/lib/weeks.ts'
import { agent, demo, onboard, logHistory, rider, THIS_WEEK } from './helpers.ts'

test('the Penyata is locked until 12 weeks', async () => {
  const a = await demo()
  await onboard(a)
  await logHistory(a, Array(8).fill(60000))
  expect((await a.get('/api/penyata')).body).toEqual({ weeksLogged: 8, unlockAt: 12, unlocked: false, summary: null })
  const r = await a.get('/api/penyata.pdf')
  expect(r.status).toBe(403)
  expect(r.body.error.message_en).toContain('8/12')
})

test('the Penyata PDF and summary label every figure', async () => {
  const a = await rider()
  const s = (await a.get('/api/penyata')).body.summary
  expect(s.weeks).toBe(12)
  expect(s.source).toBe('self')
  expect(s.monthly.every((m: { source: string }) => m.source === 'self')).toBe(true)
  expect(s.minSen).toBe(40000)
  expect(s.maxSen).toBe(95000)
  const r = await a.get('/api/penyata.pdf?months=3&lang=en').buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = []
    res.on('data', (c: Buffer) => chunks.push(c))
    res.on('end', () => cb(null, Buffer.concat(chunks)))
  })
  expect(r.status).toBe(200)
  expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-')
  expect((await a.get('/api/penyata.pdf?months=4')).status).toBe(422)
})

test('the payslip shows the week and the payday after it', async () => {
  const a = await rider()
  const p = (await a.get(`/api/payslip/${addWeeks(THIS_WEEK, -1)}`)).body
  expect(p.netSen).toBe(58000)
  expect(p.platforms[0].platform).toBe('grab')
  expect(p.salarySen).toBeGreaterThan(0)
  expect(p.transfer).not.toBeNull()
})

const pdf = (r: import('supertest').Test) => r.buffer(true).parse((res, cb) => {
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  res.on('end', () => cb(null, Buffer.concat(chunks)))
})

test('a Loan pack carries a verify code that shows the printed figures, until revoked', async () => {
  const a = await rider()
  const r = await pdf(a.get('/api/penyata.pdf?months=12&lang=en'))
  expect(r.status).toBe(200)
  const code = r.headers['x-verify-code'] as string
  expect(code).toMatch(/^CV-[2-9A-HJKMNP-TV-Z]{5}-[2-9A-HJKMNP-TV-Z]{5}$/)
  const page = await agent().get(`/o/v?code=${code.toLowerCase()}`).redirects(1) // typed in lower case, with dashes
  expect(page.status).toBe(200)
  expect(page.text).toContain('Valid code') // shown in the PDF's language unless ?lang= asks
  expect(page.text).toContain('Gross earnings')
  expect(page.text).toContain('not a credit score')
  const listed = (await a.get('/api/doc-codes')).body.codes
  expect(listed[0]).toMatchObject({ kind: 'loan', label: '12', hint: code.slice(-4), revoked: false, openedCount: 1 })
  expect((await (await demo()).delete(`/api/doc-codes/${listed[0].id}`)).status).toBe(404) // not theirs
  await a.delete(`/api/doc-codes/${listed[0].id}`)
  expect((await a.get('/api/doc-codes')).body.codes).toEqual([])
  expect((await agent().get(`/o/v/${code.replace(/-/g, '').slice(2)}`)).status).toBe(410)
  expect((await agent().get('/o/v/ZZZZZZZZZZ')).status).toBe(404)
  expect((await agent().get('/o/v')).text).toContain('CV-XXXXX-XXXXX')
})

test('the tax year summary groups costs for Borang B and is open before the 12-week unlock', async () => {
  const a = await demo()
  await onboard(a)
  await logHistory(a, [60000, 70000])
  await a.post('/api/expenses').send({ amountSen: 4000, category: 'minyak', note: 'minyak 40', input: 'text', parseTier: 'rules' })
  await a.post('/api/expenses').send({ amountSen: 30000, category: 'ansuran', note: 'ansuran motor 300', input: 'text', parseTier: 'rules' })
  await a.post('/api/expenses').send({ amountSen: 1200, category: 'makan', note: 'makan 12', input: 'text', parseTier: 'rules' })
  const years = (await a.get('/api/tax-years')).body.years as { year: number; weeks: number }[]
  expect(years.reduce((n, y) => n + y.weeks, 0)).toBe(2)
  const year = Number(THIS_WEEK.slice(0, 4))
  const s = (await a.get(`/api/tax-year/${year}`)).body
  expect(s.costs.business).toEqual({ items: [{ category: 'minyak', amountSen: 4000 }], totalSen: 4000 })
  expect(s.costs.asset.totalSen).toBe(30000) // the bike is an asset, kept out of business costs
  expect(s.costs.personal.totalSen).toBe(1200)
  expect(s.afterBusinessCostsSen).toBe(s.totals.netSen - 4000)
  const r = await pdf(a.get(`/api/tax-year.pdf?year=${year}&lang=en`))
  expect(r.status).toBe(200)
  expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-')
  const page = await agent().get(`/o/v/${(r.headers['x-verify-code'] as string).replace(/[-]/g, '').slice(2)}?lang=en`)
  expect(page.text).toContain(`Yearly Income Summary ${year}`)
  expect((await a.get('/api/tax-year.pdf?year=2021')).status).toBe(404)
})
