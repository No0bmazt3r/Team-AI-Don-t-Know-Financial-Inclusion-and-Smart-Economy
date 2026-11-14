// Privacy controls, the statement cross-check and Indeks Rider.
import { eq } from 'drizzle-orm'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireUser, SESSION_COOKIE, userOf } from '../auth.ts'
import { db, schema } from '../db/index.ts'
import { ApiError } from '../errors.ts'
import { todayKL } from '../lib/weeks.ts'
import { ml } from '../ml.ts'
import { riderIndex } from '../services/indeks.ts'
import { crossCheck, parseStatement } from '../services/statement.ts'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } })

export const accountRouter = Router()
accountRouter.use(requireUser)

// Everything stored about the rider, as one JSON file.
accountRouter.get('/me/export', async (_req, res) => {
  const user = userOf(res)
  const id = user.id
  const { googleSub: _sub, ...profile } = user
  const s = schema
  const [consents, platforms, earnings, expenses, bills, pots, salaryRuns, transfers, leave, contributions, checkins, streakFreezes, badges, tanyaMessages, codes, events, pushSubscriptions] = await Promise.all([
    db.select().from(s.consents).where(eq(s.consents.userId, id)),
    db.select().from(s.userPlatforms).where(eq(s.userPlatforms.userId, id)),
    db.select().from(s.earnings).where(eq(s.earnings.userId, id)),
    db.select().from(s.expenses).where(eq(s.expenses.userId, id)),
    db.select().from(s.bills).where(eq(s.bills.userId, id)),
    db.select().from(s.pots).where(eq(s.pots.userId, id)),
    db.select().from(s.salaryRuns).where(eq(s.salaryRuns.userId, id)),
    db.select().from(s.transfers).where(eq(s.transfers.userId, id)),
    db.select().from(s.leavePlans).where(eq(s.leavePlans.userId, id)),
    db.select().from(s.contributions).where(eq(s.contributions.userId, id)),
    db.select().from(s.checkins).where(eq(s.checkins.userId, id)),
    db.select().from(s.streakFreezes).where(eq(s.streakFreezes.userId, id)),
    db.select().from(s.badges).where(eq(s.badges.userId, id)),
    db.select().from(s.tanyaMessages).where(eq(s.tanyaMessages.userId, id)),
    db.select().from(s.docCodes).where(eq(s.docCodes.userId, id)),
    db.select().from(s.events).where(eq(s.events.userId, id)),
    db.select({ endpoint: s.pushSubscriptions.endpoint, createdAt: s.pushSubscriptions.createdAt }).from(s.pushSubscriptions).where(eq(s.pushSubscriptions.userId, id)),
  ])
  const verifyCodes = codes.map(({ codeHash: _c, ...c }) => c)
  const data = { exportedAt: new Date().toISOString(), profile, consents, platforms, earnings, expenses, bills, pots, salaryRuns, transfers, leave, contributions, checkins, streakFreezes, badges, tanyaMessages, verifyCodes, events, pushSubscriptions }
  res.set({ 'Content-Disposition': `attachment; filename="coinvoy-data-${todayKL()}.json"`, 'Cache-Control': 'no-store' }).json(data)
})

// Delete the account and every row that belongs to it. Irreversible, so the app asks for "PADAM".
accountRouter.delete('/me', async (req, res) => {
  z.strictObject({ confirm: z.literal('PADAM') }).parse(req.body)
  await db.delete(schema.users).where(eq(schema.users.id, userOf(res).id)) // every table cascades from users
  res.clearCookie(SESSION_COOKIE, { path: '/' }).status(204).end()
})

accountRouter.post('/statement', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file || !file.buffer.subarray(0, 5).toString().startsWith('%PDF')) throw new ApiError(415, 'not_a_pdf', 'Pilih fail PDF penyata bank atau e-dompet.', 'Choose a bank or e-wallet statement PDF.')
  const user = userOf(res)
  const result = await crossCheck(db, user.id, parseStatement(await ml.statementLines(new Uint8Array(file.buffer))))
  await db.insert(schema.events).values({ userId: user.id, name: 'statement_checked', props: result })
  res.json(result)
})

// Indeks Rider: anonymised RM per hour, shown only for groups of 20+.
accountRouter.get('/index', async (_req, res) => {
  res.json(await riderIndex(db, userOf(res)))
})
