import request from 'supertest'
import { createApp } from '../src/app.ts'
import { addWeeks, thisWeek } from '../src/lib/weeks.ts'
import { provider } from '../src/llm/client.ts'
import { ai, JOBS, resetAi } from '../src/llm/keys.ts'

export const app = createApp()
export const THIS_WEEK = thisWeek()
export const NETS = [62000, 48000, 91000, 55000, 40000, 73000, 95000, 52000, 61000, 44000, 80000, 58000]

/** A cookie-keeping client, like a browser. */
export const agent = () => request.agent(app)
export type Agent = ReturnType<typeof agent>

/** A demo rider with no data (the real demo seeds Faiz). */
export async function demo(a: Agent = agent(), seeded = false) {
  const res = await a.post(seeded ? '/api/auth/demo' : '/api/auth/demo?empty')
  if (res.status !== 204) throw new Error(`demo ${res.status} ${res.text}`)
  return a
}

export async function onboard(a: Agent) {
  const res = await a.patch('/api/me').send({ platforms: ['grab', 'foodpanda'], city: 'Ipoh', defaultHours: 45, essentialsWeekSen: 45000, paydayWeekday: 0, onboarded: true })
  if (res.status !== 200) throw new Error(res.text)
  return res.body.user
}

export async function logHistory(a: Agent, nets = NETS) {
  const weeks = nets.map((n, i) => ({ weekStart: addWeeks(THIS_WEEK, i - nets.length), platforms: [{ platform: 'grab', grossSen: n, hoursOnline: 45, source: 'history' }] }))
  const res = await a.post('/api/weeks/confirm').send({ weeks })
  if (res.status !== 200) throw new Error(res.text)
}

export async function rider(nets = NETS) {
  const a = await demo()
  await onboard(a)
  await logHistory(a, nets)
  return a
}

/** A fake OpenAI-compatible provider. Queue replies (string = content, object = a full message). */
export function fakeLlm() {
  const state = { replies: [] as (string | Record<string, unknown>)[], reply: '{}' as string | Record<string, unknown>, rejectSchema: false, requests: [] as Record<string, unknown>[] }
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    state.requests.push(body)
    if (state.rejectSchema && body.response_format) return new Response(JSON.stringify({ error: { message: 'response_format not supported' } }), { status: 400 })
    const reply = state.replies.length ? state.replies.shift()! : state.reply
    const message = typeof reply === 'string' ? { role: 'assistant', content: reply } : reply
    if (body.stream) {
      // Server-sent chunks like a real provider: the text a word at a time, a tool call in one piece, then usage
      const m = message as { content?: string; tool_calls?: unknown[] }
      const chunk = (delta: object, extra: object = {}) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`
      const parts = [
        ...(m.content ?? '').split(/(?<=\s)/).filter(Boolean).map((w) => chunk({ content: w })),
        ...(m.tool_calls ?? []).map((tc, index) => chunk({ tool_calls: [{ index, ...(tc as object) }] })),
        `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`,
        'data: [DONE]\n\n',
      ]
      return new Response(parts.join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
    return new Response(
      JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, finish_reason: 'stop', message }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
  provider.fetch = fetch as typeof globalThis.fetch
  // One connection in memory (not the database): Snap on a vision model, every other job on a shared one
  ai.conns = new Map([[FAKE_ID, { id: FAKE_ID, name: 'fake', baseUrl: 'http://fake/v1', apiKey: 'fake-key', providerName: 'Fake AI', regionNote: '', status: 'ok', coolingUntil: null }]])
  ai.jobs = Object.fromEntries(JOBS.map((j) => [j, [{ connectionId: FAKE_ID, model: j === 'snap' ? 'vision-model' : 'shared-model', reasoning: null }]])) as typeof ai.jobs
  return state
}
export const FAKE_ID = 900_001 // test/setup.ts puts a matching row in ai_connections, so usage rows can point at it

export function noLlm() {
  provider.fetch = null
  resetAi()
}

/** A one-page PDF with these lines as real text (like a bank or platform statement). No lines = a page with no text, like a scan. */
export function pdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`)
  const content = `BT /F1 10 Tf 40 800 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
