// Rekod: payslips, the Loan pack and Tax year PDFs, and their verify codes.
import { randomBytes } from 'node:crypto'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { Router, type Response } from 'express'
import { z } from 'zod'
import { requireUser, sha256, type User, userOf } from '../auth.ts'
import { db, schema } from '../db/index.ts'
import { ApiError, notFound } from '../errors.ts'
import { todayKL } from '../lib/weeks.ts'
import { ml } from '../ml.ts'
import { env } from '../env.ts'
import { type Months, payslip, statement, taxYear, taxYears, UNLOCK_WEEKS, weeksLogged } from '../services/penyata.ts'

const CODE_DAYS = 90
const MONTHS = z.enum(['3', '6', '12'])

async function assertUnlocked(user: User) {
  const n = await weeksLogged(db, user.id)
  if (n < UNLOCK_WEEKS) throw new ApiError(403, 'penyata_locked', `Penyata dibuka selepas 12 minggu data (${n}/12).`, `The statement unlocks with 12 weeks of data (${n}/12).`)
}

export const recordsRouter = Router()

recordsRouter.get('/api/payslip/:week', requireUser, async (req, res) => {
  res.json(await payslip(db, userOf(res), z.iso.date().parse(req.params.week)))
})

recordsRouter.get('/api/penyata', requireUser, async (_req, res) => {
  const user = userOf(res)
  const n = await weeksLogged(db, user.id)
  const unlocked = n >= UNLOCK_WEEKS
  res.json({ weeksLogged: n, unlockAt: UNLOCK_WEEKS, unlocked, summary: unlocked ? await statement(db, user, 3) : null })
})

// Verify codes: 10 characters from an alphabet with no look-alikes (no I, L, O, U, 0, 1), about 49 bits. Shown as
// CV-XXXXX-XXXXX. Stored hashed; the PDF and its QR carry the only copy.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const newCode = () => [...randomBytes(10)].map((b) => ALPHABET[b % ALPHABET.length]).join('') // ponytail: tiny modulo bias, fine for a lookup code
const normalise = (raw: string) => raw.toUpperCase().replace(/^CV/, '').replace(/[^0-9A-Z]/g, '')
const pretty = (code: string) => `CV-${code.slice(0, 5)}-${code.slice(5)}`
type Code = typeof schema.docCodes.$inferSelect
const codeJson = (c: Code) => ({ id: c.id, kind: c.kind, label: c.label, hint: c.hint, expiresAt: c.expiresAt.toISOString(), revoked: c.revokedAt !== null, openedCount: c.openedCount, createdAt: c.createdAt.toISOString() })

/** Makes a code for this exact snapshot and renders the PDF with it. */
async function pdfWithCode(res: Response, user: User, kind: 'loan' | 'tax', label: string, lang: 'ms' | 'en', data: Record<string, unknown>, filename: string) {
  const code = newCode()
  await db.insert(schema.docCodes).values({ userId: user.id, codeHash: sha256(code), hint: code.slice(-4), kind, label, lang, snapshot: data, expiresAt: new Date(Date.now() + CODE_DAYS * 86_400_000) })
  const pdf = await ml.penyataPdf({ data, lang, name: user.displayName, generated: todayKL(), kind, code: pretty(code), verifyUrl: `${env.APP_URL}/o/v/${code}` })
  await db.insert(schema.events).values({ userId: user.id, name: kind === 'loan' ? 'penyata_generated' : 'tax_summary_generated', props: { label } })
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store', 'X-Verify-Code': pretty(code) }).send(pdf)
}

recordsRouter.get('/api/penyata.pdf', requireUser, async (req, res) => {
  const q = z.object({ months: MONTHS.default('3'), lang: z.enum(['ms', 'en']).default('ms') }).parse(req.query)
  const user = userOf(res)
  await assertUnlocked(user)
  const months = Number(q.months) as Months
  await pdfWithCode(res, user, 'loan', q.months, q.lang, await statement(db, user, months), `coinvoy-${q.lang === 'en' ? 'loan-pack' : 'pek-pinjaman'}-${months}${q.lang === 'en' ? 'months' : 'bulan'}.pdf`)
})

// The tax year summary is the rider's own records, so it isn't locked: gaps are stated on it instead.
const YEAR = z.coerce.number().int().min(2020).max(2100)
recordsRouter.get('/api/tax-years', requireUser, async (_req, res) => {
  res.json({ years: await taxYears(db, userOf(res).id) })
})

recordsRouter.get('/api/tax-year/:year', requireUser, async (req, res) => {
  res.json(await taxYear(db, userOf(res), YEAR.parse(req.params.year)))
})

recordsRouter.get('/api/tax-year.pdf', requireUser, async (req, res) => {
  const q = z.object({ year: YEAR, lang: z.enum(['ms', 'en']).default('ms') }).parse(req.query)
  const user = userOf(res)
  const data = await taxYear(db, user, q.year)
  if (!data.weeks) throw new ApiError(404, 'no_weeks', `Tiada pendapatan direkod untuk ${q.year}.`, `No earnings recorded for ${q.year}.`)
  await pdfWithCode(res, user, 'tax', String(q.year), q.lang, data, `coinvoy-${q.lang === 'en' ? 'tax-summary' : 'ringkasan-cukai'}-${q.year}.pdf`)
})

recordsRouter.get('/api/doc-codes', requireUser, async (_req, res) => {
  const rows = await db.select().from(schema.docCodes).where(and(eq(schema.docCodes.userId, userOf(res).id), isNull(schema.docCodes.revokedAt), gt(schema.docCodes.expiresAt, new Date()))).orderBy(desc(schema.docCodes.id))
  res.json({ codes: rows.map(codeJson) }) // live codes only: the ones a rider might want to cancel
})

recordsRouter.delete('/api/doc-codes/:id', requireUser, async (req, res) => {
  const user = userOf(res)
  const [c] = await db.select().from(schema.docCodes).where(and(eq(schema.docCodes.id, z.coerce.number().int().parse(req.params.id)), eq(schema.docCodes.userId, user.id)))
  if (!c) throw notFound()
  if (!c.revokedAt) await db.update(schema.docCodes).set({ revokedAt: new Date() }).where(eq(schema.docCodes.id, c.id))
  res.status(204).end()
})

const GONE = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Coinvoy</title>
<body style="font:16px system-ui;padding:32px;max-width:480px;margin:auto">
<h1>Kod tidak lagi sah</h1><p>Penunggang telah membatalkan kod ini, atau ia sudah tamat tempoh.</p>
<h1>This code is no longer valid</h1><p>The rider cancelled it, or it has expired.</p></body>`

const privateHeaders = (res: Response) => res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })

// The verify page, public and read-only. An officer types the code from the PDF (or scans its QR) and sees the
// figures exactly as they were printed, from the stored snapshot, so an edited PDF doesn't match.
const VERIFY_FORM = (bad: boolean) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Semak kod · Verify code · Coinvoy</title>
<body style="margin:0;background:#F6F7F2;color:#1D1E1D;font:16px/1.5 system-ui,sans-serif"><main style="max-width:440px;margin:0 auto;padding:40px 16px">
<h1 style="font-size:22px;margin:0 0 4px">Semak dokumen Coinvoy</h1><p style="margin:0 0 20px;color:#5B5E57">Verify a Coinvoy document. Masukkan kod pada PDF · Enter the code printed on the PDF.</p>
<form method="get" action="/o/v" style="display:flex;flex-direction:column;gap:12px">
<label for="c" style="font-weight:600">Kod · Code</label>
<input id="c" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CV-XXXXX-XXXXX" style="height:52px;border:1px solid #8A8E85;border-radius:10px;padding:0 14px;font:600 18px ui-monospace,monospace;letter-spacing:.06em">
${bad ? '<p role="alert" style="margin:0;color:#B91C1C;font-weight:600">Kod tidak sah · That code is not valid.</p>' : ''}
<button style="height:52px;border:0;border-radius:10px;background:#1D1E1D;color:#fff;font:600 16px system-ui">Semak · Verify</button></form></main></body>`

recordsRouter.get('/o/v', (req, res) => {
  privateHeaders(res)
  const code = normalise(String(req.query.code ?? ''))
  if (code.length === 10) return res.redirect(303, `/o/v/${code}`)
  res.status(req.query.code === undefined ? 200 : 400).type('html').send(VERIFY_FORM(req.query.code !== undefined))
})

recordsRouter.get('/o/v/:code', async (req, res) => {
  privateHeaders(res)
  const code = normalise(String(req.params.code))
  const [c] = code.length === 10 ? await db.select().from(schema.docCodes).where(eq(schema.docCodes.codeHash, sha256(code))) : []
  if (!c) return void res.status(404).type('html').send(VERIFY_FORM(true))
  if (c.revokedAt || c.expiresAt < new Date()) return void res.status(410).type('html').send(GONE)
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, c.userId))
  await db.update(schema.docCodes).set({ openedCount: c.openedCount + 1 }).where(eq(schema.docCodes.id, c.id))
  await db.insert(schema.events).values({ userId: c.userId, name: 'doc_code_opened', props: { code_id: c.id } })
  const lang = req.query.lang === 'en' || req.query.lang === 'ms' ? req.query.lang : (c.lang as 'ms' | 'en')
  const html = await ml.penyataHtml({
    data: c.snapshot, lang, name: user!.displayName, generated: c.createdAt.toISOString().slice(0, 10), kind: c.kind as 'loan' | 'tax',
    code: pretty(code), expires: c.expiresAt.toISOString().slice(0, 10), verified: true,
  })
  res.type('html').send(html)
})

