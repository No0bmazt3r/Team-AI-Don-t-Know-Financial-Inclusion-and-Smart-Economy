// Penasihat: Jurang, Tanya, Semak Layak, the lender check and Celik.
import { and, asc, desc, eq, lt } from 'drizzle-orm'
import { Router } from 'express'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { z } from 'zod'
import { requireUser, userOf } from '../auth.ts'
import { db, schema } from '../db/index.ts'
import { env } from '../env.ts'
import { llmConfigured } from '../llm/client.ts'
import { chat } from '../llm/client.ts'
import { answer, type TanyaEvent } from '../llm/tanya.ts'
import { checkQuota, logUsage } from '../llm/usage.ts'
import { ml } from '../ml.ts'
import { checkOffer, instalment, LlmOffer } from '../services/advisor.ts'
import { triggered } from '../services/lessons.ts'
import { aiAllowed } from '../services/reco.ts'
import { checkMessage } from '../services/scam.ts'
import { buildInputs, currentWeek } from '../services/salary.ts'
import { readFileSync } from 'node:fs'
import { ApiError } from '../errors.ts'
import { errorFields, log } from '../log.ts'
import { MAX_SEN } from '../lib/limits.ts'

const LENDER_PROMPT = readFileSync(new URL('../llm/prompts/lender.md', import.meta.url), 'utf8')
const SCAM_PROMPT = readFileSync(new URL('../llm/prompts/scam.md', import.meta.url), 'utf8')
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000 // Tanya messages are kept 90 days
const HISTORY_TURNS = 10

export const advisorRouter = Router()
advisorRouter.use(requireUser)

async function inputsFor(res: Parameters<typeof userOf>[0]) {
  const user = userOf(res)
  return { user, inputs: await buildInputs(db, user, await currentWeek(db, user.id)) }
}

// When the safe salary is below essentials: the gap, and three ways to close it, every number simulated.
advisorRouter.get('/jurang', async (_req, res) => {
  const { user, inputs } = await inputsFor(res)
  if (!inputs) return void res.json({ active: false })
  const j = await ml.jurang(inputs)
  if (!j.active) return void res.json(j)
  await db.insert(schema.events).values({ userId: user.id, name: 'jurang_shown', props: { gap_sen: j.gapSen } })
  res.json({
    ...j,
    entitlements: { isaraanMatchRate: env.ISARAAN_MATCH_RATE, isaraanMatchCapSen: env.ISARAAN_MATCH_CAP_SEN, perkesoDeductedAtSource: env.PERKESO_DEDUCTED_AT_SOURCE },
  })
})

advisorRouter.get('/tanya/messages', async (_req, res) => {
  const rows = await db.select().from(schema.tanyaMessages).where(eq(schema.tanyaMessages.userId, userOf(res).id)).orderBy(asc(schema.tanyaMessages.id)).limit(200)
  res.json({ messages: rows.map((m) => ({ id: m.id, role: m.role, content: m.content, risk: m.risk, guardTriggered: m.guardTriggered, at: m.createdAt.toISOString() })) })
})

// "Clear chat": deletes the rider's whole Tanya history
advisorRouter.delete('/tanya/messages', async (_req, res) => {
  await db.delete(schema.tanyaMessages).where(eq(schema.tanyaMessages.userId, userOf(res).id))
  res.status(204).end()
})

// ?stream=1: the reply arrives as it is written, one JSON event per line (text / reset / done / error).
// The answer is saved even if the rider leaves the page halfway, so it is there when they come back.
advisorRouter.post('/tanya/messages', async (req, res) => {
  const user = userOf(res)
  const { message, lang: requestedLang } = z.strictObject({ message: z.string().trim().min(1).max(500), lang: z.enum(['ms', 'en']).optional() }).parse(req.body)
  const lang: 'ms' | 'en' = requestedLang ?? (user.lang === 'en' ? 'en' : 'ms')
  await checkQuota(user.id, 'tanya')
  await db.delete(schema.tanyaMessages).where(and(eq(schema.tanyaMessages.userId, user.id), lt(schema.tanyaMessages.createdAt, new Date(Date.now() - RETENTION_MS))))
  const recent = await db.select().from(schema.tanyaMessages).where(eq(schema.tanyaMessages.userId, user.id)).orderBy(desc(schema.tanyaMessages.id)).limit(HISTORY_TURNS * 2)
  const history: ChatCompletionMessageParam[] = recent.reverse().map((m) => (m.role === 'user' ? { role: 'user', content: `<rider_message>${m.content}</rider_message>` } : { role: 'assistant', content: m.content }))
  const turn = async (onEvent?: (e: TanyaEvent) => void) => {
    const out = await answer(user, history, message, lang ?? user.lang, (r) => logUsage(user.id, 'tanya', r), onEvent)
    const [saved] = await db
      .insert(schema.tanyaMessages)
      .values([
        { userId: user.id, role: 'user', content: message },
        { userId: user.id, role: 'assistant', content: out.reply, tools: out.tools, risk: out.risk, guardTriggered: out.guardTriggered },
      ])
      .returning()
    await db.insert(schema.events).values({ userId: user.id, name: 'tanya_turn', props: { tools: out.tools, guard_triggered: out.guardTriggered } })
    return { reply: out.reply, risk: out.risk, guardTriggered: out.guardTriggered, at: saved!.createdAt.toISOString() }
  }
  if (req.query.stream !== '1') return void res.json(await turn())

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' })
  const send = (e: object) => void (res.writableEnded || res.destroyed || res.write(`${JSON.stringify(e)}\n`))
  try {
    send({ type: 'done', ...(await turn(send)) })
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError(500, 'server', 'Ralat pelayan. Cuba lagi.', 'Server error. Try again.')
    if (!(err instanceof ApiError)) log('error', 'tanya stream', errorFields(err))
    send({ type: 'error', error: { code: e.code, message_ms: e.messageMs, message_en: e.message } })
  }
  res.end()
})

const LayakIn = z.strictObject({
  item: z.string().min(1).max(40),
  priceSen: z.number().int().positive().max(MAX_SEN),
  depositSen: z.number().int().min(0).max(MAX_SEN).default(0),
  months: z.number().int().min(1).max(120),
  flatRatePct: z.number().min(0).max(100),
})

// Semak Layak: what the instalment does to the rider's own future weeks. A risky result is shown as plainly as a
// safe one; Coinvoy earns the same whether the rider borrows or not.
advisorRouter.post('/layak', async (req, res) => {
  const body = LayakIn.parse(req.body)
  const { user, inputs } = await inputsFor(res)
  if (!inputs) throw new ApiError(422, 'no_salary_yet', 'Snap pendapatan dahulu.', 'Snap your earnings first.')
  const loan = instalment(body.priceSen, body.depositSen, body.months, body.flatRatePct)
  const now = await ml.solve(inputs)
  const scenario = { addMonthlySen: loan.monthlySen, oneOffSen: body.depositSen, oneOffWeek: 1 }
  const [after, safety] = await Promise.all([ml.solve(inputs, scenario), ml.pSafe(inputs, now.salarySen, scenario)])
  await db.insert(schema.events).values({ userId: user.id, name: 'layak_checked', props: { risk: safety.risk } })
  res.json({ ...loan, item: body.item, salarySen: now.salarySen, newSalarySen: after.salarySen, pSafe: safety.pSafe, risk: safety.risk })
})

// Lender check: red flags plus a match against a dated copy of BNM's alert list. Works without the LLM.
advisorRouter.post('/lender-check', async (req, res) => {
  const user = userOf(res)
  const { text } = z.strictObject({ text: z.string().trim().min(10).max(2000) }).parse(req.body)
  let offer: LlmOffer | null = null
  if (llmConfigured()) {
    try {
      await checkQuota(user.id, 'lender')
      const r = await chat('lender', [{ role: 'system', content: LENDER_PROMPT }, { role: 'user', content: `<offer>${text}</offer>` }], { schema: LlmOffer, maxTokens: 400 })
      await logUsage(user.id, 'lender', r)
      offer = r.parsed
    } catch (err) {
      if (!(err instanceof ApiError)) throw err // the rules and the list still answer
    }
  }
  const result = checkOffer(text, offer)
  await db.insert(schema.events).values({ userId: user.id, name: 'lender_checked', props: { level: result.level, fca: result.fca.matched } })
  res.json({ ...result, usedAi: offer !== null })
})

// Semak Mesej. Works without AI. With the rider's permission, the AI can add extra signs it noticed
// (it shares the lender check's daily limit). We only store the result level, never the message.
advisorRouter.post('/scam-check', async (req, res) => {
  const user = userOf(res)
  const { text } = z.strictObject({ text: z.string().trim().min(5).max(2000) }).parse(req.body)
  const result = checkMessage(text)
  let extraFlags: string[] = []
  let usedAi = false
  if (await aiAllowed(db, user, 'lender')) {
    try {
      await checkQuota(user.id, 'lender')
      const lang = user.lang === 'en' ? 'English' : 'Bahasa Melayu'
      const r = await chat('lender', [{ role: 'system', content: SCAM_PROMPT.replace('{lang}', lang) }, { role: 'user', content: `<message>${text}</message>` }], {
        schema: z.object({ red_flags: z.array(z.string().max(160)).max(4).default([]) }),
        maxTokens: 300,
      })
      await logUsage(user.id, 'lender', r)
      extraFlags = r.parsed.red_flags
      usedAi = true
    } catch (err) {
      if (!(err instanceof ApiError)) throw err // the rules still answer
    }
  }
  // AI signs can't lower the level, and alone they raise "no signs" to "be careful" at most
  const level = result.level === 'rendah' && extraFlags.length ? 'sederhana' : result.level
  await db.insert(schema.events).values({ userId: user.id, name: 'scam_checked', props: { level } })
  res.json({ ...result, level, extraFlags, usedAi })
})

advisorRouter.get('/celik', async (_req, res) => {
  const user = userOf(res)
  res.json({ lessons: await triggered(db, user, user.lang) })
})
