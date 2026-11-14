// BM cost entry: type "minyak 40", see the parsed chip, save. Tiers 1–2 run in the ML service
// (rules + our classifier); the LLM only fills what they couldn't, and a number the rules found always wins.
import { readFileSync } from 'node:fs'
import { and, desc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireUser, userOf } from '../auth.ts'
import { db, schema } from '../db/index.ts'
import { llmConfigured } from '../llm/client.ts'
import { ApiError, notFound } from '../errors.ts'
import { thisWeek, todayKL, weekStart } from '../lib/weeks.ts'
import { chat } from '../llm/client.ts'
import { checkQuota, logUsage } from '../llm/usage.ts'
import { ml } from '../ml.ts'
import { MAX_SEN } from '../lib/limits.ts'

export const CATEGORIES = ['minyak', 'servis', 'ansuran', 'makan', 'telefon', 'parking', 'tol', 'sewa', 'keluarga', 'motor_tahunan', 'lain'] as const
const PROMPT = readFileSync(new URL('../llm/prompts/bm.md', import.meta.url), 'utf8')
const LlmCost = z.object({ category: z.enum(CATEGORIES), amount_rm: z.number().min(0).max(100_000).nullable().default(null) })
const ExpenseIn = z.strictObject({
  weekStart: z.iso.date().nullable().optional(),
  amountSen: z.number().int().positive().max(MAX_SEN),
  category: z.enum(CATEGORIES),
  note: z.string().max(120).nullable().optional(),
  input: z.enum(['text', 'voice', 'form']).default('text'),
  parseTier: z.enum(['rules', 'classifier', 'llm', 'manual']).nullable().optional(),
})
const expenseJson = (x: typeof schema.expenses.$inferSelect) => ({ id: x.id, weekStart: x.weekStart, amountSen: x.amountSen, category: x.category, note: x.note, input: x.input, parseTier: x.parseTier })

export const expensesRouter = Router()
expensesRouter.use(requireUser)

expensesRouter.post('/expenses/parse', async (req, res) => {
  const user = userOf(res)
  const { text } = z.strictObject({ text: z.string().trim().min(1).max(120) }).parse(req.body)
  const p = await ml.parseCost(text)
  if (p.needsLlm && llmConfigured()) {
    try {
      await checkQuota(user.id, 'bm')
      const r = await chat('bm', [{ role: 'system', content: PROMPT }, { role: 'user', content: `<note>${text}</note>` }], { schema: LlmCost, maxTokens: 200 })
      await logUsage(user.id, 'bm', r)
      return void res.json({
        amountSen: p.amountSen ?? (r.parsed.amount_rm === null ? null : Math.round(r.parsed.amount_rm * 100)),
        category: p.tier === 'rules' && p.category ? p.category : r.parsed.category,
        tier: 'llm',
        confidence: 0,
      })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err // the LLM is a bonus tier; tiers 1–2 already answered
    }
  }
  res.json({ amountSen: p.amountSen, category: p.category, tier: p.tier, confidence: p.confidence })
})

expensesRouter.post('/expenses', async (req, res) => {
  const body = ExpenseIn.parse(req.body)
  const user = userOf(res)
  const week = weekStart(body.weekStart ?? todayKL())
  if (week > thisWeek()) throw new ApiError(422, 'bad_week', 'Minggu tidak sah.', "That week isn't valid.")
  const [x] = await db
    .insert(schema.expenses)
    .values({ userId: user.id, weekStart: week, amountSen: body.amountSen, category: body.category, note: body.note ?? null, input: body.input, parseTier: body.parseTier ?? null })
    .returning()
  await db.insert(schema.events).values({ userId: user.id, name: 'expense_added', props: { tier: body.parseTier ?? null, input: body.input } })
  res.status(201).json({ expense: expenseJson(x!) })
})

expensesRouter.get('/expenses', async (req, res) => {
  const user = userOf(res)
  const week = typeof req.query.week === 'string' ? weekStart(z.iso.date().parse(req.query.week)) : null
  const rows = await db
    .select()
    .from(schema.expenses)
    .where(week ? and(eq(schema.expenses.userId, user.id), eq(schema.expenses.weekStart, week)) : eq(schema.expenses.userId, user.id))
    .orderBy(desc(schema.expenses.id))
    .limit(200)
  res.json({ expenses: rows.map(expenseJson) })
})

expensesRouter.delete('/expenses/:id', async (req, res) => {
  const user = userOf(res)
  const [x] = await db.select().from(schema.expenses).where(and(eq(schema.expenses.id, z.coerce.number().int().parse(req.params.id)), eq(schema.expenses.userId, user.id)))
  if (!x) throw notFound()
  await db.delete(schema.expenses).where(eq(schema.expenses.id, x.id))
  res.status(204).end()
})
