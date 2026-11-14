// Tanya: a small tool loop over the engine, with the number guard on every reply.
// Tools are read-only and scoped to the signed-in rider. The model talks; the engine computes.
import { readFileSync } from 'node:fs'
import { and, eq } from 'drizzle-orm'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import type { User } from '../auth.ts'
import { db, schema } from '../db/index.ts'
import { addWeeks } from '../lib/weeks.ts'
import { ml, type Risk, type Scenario } from '../ml.ts'
import { lesson } from '../services/lessons.ts'
import { ensurePots } from '../services/pots.ts'
import { runScenario } from '../services/salary.ts'
import { ApiError } from '../errors.ts'
import { type ChatResult, chat, chatStream } from './client.ts'
import { allowedValues, check } from './guard.ts'

const PROMPT = readFileSync(new URL('./prompts/tanya.md', import.meta.url), 'utf8')

// Tanya's writing style (a text chatbot), by the language set in Profil: casual Manglish in English, casual Malay in BM.
const STYLE = {
  en: `- Reply in casual Malaysian English (Manglish), the way riders text each other: short sentences, a particle like "lah", "lor", "ah", "can", "ok what" here and there (one or two per reply, not every sentence), and common Malay words riders use anyway: gaji, duit, tabung, bil, cuti, minggu ni.
- Call the rider "you". Never switch to formal English or to full Malay unless the rider writes in Malay.
- Example: "Safe. Your gaji this week can cover it lah. Just don't spend the whole thing at once ah, keep some for your bil."`,
  ms: `- Balas dalam Bahasa Melayu santai, macam mesej dengan kawan: ayat pendek, guna "tak", "nak", "dah", "je", "kan", "tau", "sikit", "boleh". Jangan guna bahasa buku atau ayat rasmi.
- Panggil rider "awak". Perkataan Inggeris yang biasa rider guna (top-up, servis, apps) boleh dikekalkan.
- Contoh: "Selamat. Gaji minggu ni cukup untuk tu. Cuma jangan habiskan sekali gus tau, simpan sikit untuk bil."`,
}
const MAX_TOOL_ROUNDS = 4
const MAX_RM = 10_000_000 // a house or a car still fits; beyond this the tool says it's too big to work out
const SCAM_HOTLINE = '997' // NSRC, the National Scam Response Centre (prompts/tanya.md)
const RISK: Record<'ms' | 'en', Record<Risk, string>> = {
  ms: { selamat: 'Selamat', berhati: 'Berhati-hati', berisiko: 'Berisiko' },
  en: { selamat: 'Safe', berhati: 'Careful', berisiko: 'Risky' },
}

const fn = (name: string, description: string, properties: Record<string, unknown> = {}): ChatCompletionTool => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, additionalProperties: false } },
})

export const TOOLS: ChatCompletionTool[] = [
  fn('get_salary', "This week's safe salary, its risk word and safety %, the buffer, and the gap if any."),
  fn('get_forecast', "The rider's usual weekly earnings: a slow week, a usual week and a busy week, and planned hours."),
  fn('simulate', "What-if: the new safe salary and how safe the current salary stays if something changes. Use it for 'can I afford', new instalments, one-off purchases, more or fewer hours, or leave.", {
    hours_per_week: { type: 'number', minimum: 0, maximum: 84 },
    add_monthly_instalment_rm: { type: 'number', minimum: 0, maximum: MAX_RM },
    one_off_expense_rm: { type: 'number', minimum: 0, maximum: MAX_RM },
    one_off_in_weeks: { type: 'integer', minimum: 0, maximum: 11 },
    leave_in_weeks: { type: 'integer', minimum: 1, maximum: 11 },
    leave_weeks: { type: 'integer', minimum: 1, maximum: 4 },
  }),
  fn('get_pots', "The rider's pots (Penampan, Cuti, Kecemasan, Motor, Raya, i-Saraan) with balances and targets."),
  fn('get_bills', "The rider's bills with amounts and how often they are due."),
  fn('explain', "A short lesson using the rider's own numbers.", {
    topic: { type: 'string', enum: ['commission', 'buffer', 'flat_vs_effective', 'perkeso', 'isaraan', 'leave'] },
  }),
]

const rm = (sen: number) => Math.round(sen) / 100
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** Every tool reads only this rider's data. Money comes back in ringgit (_rm) for the model to quote. */
export async function runTool(user: User, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (name === 'get_salary' || name === 'get_forecast' || name === 'simulate') {
    const base = await runScenario(db, user)
    if (!base) return { error: 'no_earnings_logged_yet' }
    const { inputs, result: now } = base
    if (name === 'get_salary') {
      return { salary_rm: rm(now.salarySen), safe_percent: Math.round(now.pSafe * 100), risk: now.risk, buffer_rm: rm(inputs.bufferSen), essentials_rm: rm(inputs.essentialsWeekSen), gap_rm: rm(now.jurang?.gapSen ?? 0) }
    }
    if (name === 'get_forecast') return { slow_week_rm: rm(now.band.low), usual_week_rm: rm(now.band.mid), busy_week_rm: rm(now.band.high), planned_hours: now.plannedHours }
    const money = [args.add_monthly_instalment_rm, args.one_off_expense_rm]
    if (money.some((v) => v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0))) return { error: 'amount_not_a_plain_number', what_to_do: 'ask the rider to confirm the amount' }
    if (money.some((v) => typeof v === 'number' && v > MAX_RM)) return { error: 'amount_too_large_to_work_out', max_rm: MAX_RM }
    const scenario: Scenario = {
      hours: typeof args.hours_per_week === 'number' ? args.hours_per_week : null,
      addMonthlySen: Math.round(num(args.add_monthly_instalment_rm) * 100),
      oneOffSen: Math.round(num(args.one_off_expense_rm) * 100),
      oneOffWeek: num(args.one_off_in_weeks, 1),
      leaves: args.leave_in_weeks ? [{ startWeek: addWeeks(inputs.weekStart, num(args.leave_in_weeks, 1)), weeks: num(args.leave_weeks, 1), setAsideWeekSen: 0 }] : [],
    }
    const [next, safety] = await Promise.all([ml.solve(inputs, scenario), ml.pSafe(inputs, now.salarySen, scenario)])
    return {
      current_salary_rm: rm(now.salarySen),
      current_salary_safe_percent_after: Math.round(safety.pSafe * 100),
      risk: safety.risk,
      new_safe_salary_rm: rm(next.salarySen),
      salary_change_rm: rm(next.salarySen - now.salarySen),
    }
  }
  if (name === 'get_pots') {
    return { pots: Object.values(await ensurePots(db, user.id)).filter((p) => p.active || p.balanceSen).map((p) => ({ pot: p.name ?? p.kind, balance_rm: rm(p.balanceSen), target_rm: rm(p.targetSen), weekly_rm: rm(p.weeklySen) })) }
  }
  if (name === 'get_bills') {
    const rows = await db.select().from(schema.bills).where(and(eq(schema.bills.userId, user.id), eq(schema.bills.active, true)))
    return { bills: rows.map((b) => ({ name: b.name, amount_rm: rm(b.amountSen), frequency: b.frequency })) }
  }
  if (name === 'explain') return lesson(db, user, String(args.topic ?? 'buffer'), user.lang)
  return { error: 'unknown_tool' }
}

/** Built only from tool results, so it can't contain a made-up number. */
export function fallback(results: Record<string, unknown>[], lang: 'ms' | 'en'): string {
  const sim = results.find((r) => 'new_safe_salary_rm' in r) as Record<string, number> & { risk: Risk } | undefined
  const sal = results.find((r) => 'salary_rm' in r) as Record<string, number> & { risk: Risk } | undefined
  if (sim) {
    const w = RISK[lang][sim.risk]
    return lang === 'ms'
      ? `${w}. Gaji anda kekal ${sim.current_salary_safe_percent_after}% selamat dengan perubahan ini. Gaji selamat baharu: RM${Math.round(sim.new_safe_salary_rm!)}.`
      : `${w}. Your salary stays ${sim.current_salary_safe_percent_after}% safe with this change. New safe salary: RM${Math.round(sim.new_safe_salary_rm!)}.`
  }
  if (sal) {
    const w = RISK[lang][sal.risk]
    return lang === 'ms' ? `${w}. Gaji anda minggu ini RM${Math.round(sal.salary_rm!)}, ${sal.safe_percent}% selamat.` : `${w}. Your salary this week is RM${Math.round(sal.salary_rm!)}, ${sal.safe_percent}% safe.`
  }
  return lang === 'ms' ? 'Maaf, saya tak dapat jawab dengan tepat. Cuba tanya tentang gaji, tabung, bil atau cuti anda.' : "Sorry, I can't answer that precisely. Try asking about your salary, pots, bills or leave."
}

/** What a streamed reply sends on the way: more text, or "drop what you showed" (a tool round, or the guard said no). */
export type TanyaEvent = { type: 'text'; text: string } | { type: 'reset' }

/**
 * How much of a draft that is still arriving can be shown: whole words only, holding back the last two (a number's
 * unit, or the rest of a number in words, may still be coming), and nothing new while a number in it fails the guard.
 * The finished reply is still checked in full before it is saved.
 */
export function safeLength(draft: string, allowed: Set<number>): number {
  const complete = draft.slice(0, Math.max(0, draft.search(/\s\S*$/)))
  const words = [...complete.matchAll(/\S+/g)]
  if (words.length <= 2 || check(complete, allowed).length) return 0
  return words.at(-2)!.index
}

export type TanyaAnswer = { reply: string; risk: Risk | null; tools: string[]; guardTriggered: boolean }

export async function answer(
  user: User,
  history: ChatCompletionMessageParam[],
  message: string,
  lang: 'ms' | 'en',
  onCall: (r: ChatResult<undefined>) => Promise<void>,
  onEvent?: (e: TanyaEvent) => void, // given: stream the reply as it is written
): Promise<TanyaAnswer> {
  const system = `${PROMPT.replace('{style}', STYLE[lang])}\n\nLanguage requirement: Reply only in ${lang === 'en' ? 'English' : 'Bahasa Melayu'} for this turn. Do not follow the language used in older messages if it differs.`
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: `<rider_message>${message}</rider_message>` }]
  const results: Record<string, unknown>[] = []
  const tools: string[] = []
  const allowedNow = () => allowedValues(message, SCAM_HOTLINE, ...results.map((x) => JSON.stringify(x)))
  let shown = 0 // characters of the current draft the rider can already see
  const complete = async (msgs: ChatCompletionMessageParam[]) => {
    let draft = ''
    const allowed = allowedNow()
    const r = onEvent
      ? await chatStream('tanya', msgs, { tools: TOOLS, maxTokens: 800 }, (text) => {
          draft += text
          const n = safeLength(draft, allowed)
          if (n > shown) {
            onEvent({ type: 'text', text: draft.slice(shown, n) })
            shown = n
          }
        })
      : await chat('tanya', msgs, { tools: TOOLS, maxTokens: 800 })
    await onCall(r)
    return r
  }
  const reset = () => {
    if (shown) onEvent?.({ type: 'reset' })
    shown = 0
  }

  // Once the engine has answered, a failed AI call doesn't cost the rider the answer: the templated reply is built
  // only from tool results, so it still passes the guard.
  const orFallback = async (msgs: ChatCompletionMessageParam[]) => {
    try {
      return await complete(msgs)
    } catch (err) {
      if (!(err instanceof ApiError) || !err.code.startsWith('llm_') || !results.length) throw err
      return null
    }
  }

  let reply = ''
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const r = await orFallback(messages)
    if (!r) break
    const calls = (r.message.tool_calls ?? []).filter((c) => c.type === 'function')
    if (!calls.length) {
      reply = r.message.content ?? ''
      break
    }
    reset() // any "let me check" text before a tool call isn't the answer
    // Parse each call's arguments once. What goes back to the provider is always valid JSON: a model that writes
    // {"one_off_expense_rm": 250,00000} would otherwise make the next request fail (Gemini answers 400).
    const parsed = calls.map((c) => {
      try {
        const a: unknown = JSON.parse(c.function.arguments || '{}')
        return a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : null
      } catch {
        return null
      }
    })
    messages.push({ role: 'assistant', content: r.message.content ?? '', tool_calls: calls.map((c, i) => ({ ...c, function: { ...c.function, arguments: JSON.stringify(parsed[i] ?? {}) } })) })
    for (const [i, c] of calls.entries()) {
      const out = parsed[i] ? await runTool(user, c.function.name, parsed[i]) : { error: 'amount_not_a_plain_number', what_to_do: 'ask the rider to confirm the amount' }
      results.push(out)
      tools.push(c.function.name)
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out) })
    }
  }

  // Besides tool results and the rider's words, one fixed fact the prompt tells Tanya to give: the scam hotline
  const allowed = allowedNow()
  const bad = check(reply, allowed)
  if (bad.length) {
    reset()
    // One retry, naming the numbers that had no source; then the templated answer.
    const note = `Your draft used numbers no tool returned: ${bad.join(', ')}. Rewrite it using only numbers from the tool results above, or call a tool.`
    const retry = await orFallback([...messages, { role: 'assistant', content: reply }, { role: 'system', content: note }])
    reply = retry?.message.content ?? ''
    if (!reply || check(reply, allowed).length || retry?.message.tool_calls?.length) reply = fallback(results, lang)
  }
  if (!reply.trim()) reply = fallback(results, lang)
  const risk = ([...results].reverse().find((x) => typeof x.risk === 'string')?.risk ?? null) as Risk | null
  return { reply: reply.trim(), risk, tools, guardTriggered: bad.length > 0 }
}
