// One LLM client for every provider that speaks the OpenAI chat API. OpenRouter, Gemini, OpenAI, Anthropic,
// Groq and Ollama all do. Which provider, key and model each job uses is set in /admin/ai (src/llm/keys.ts), never code.
// Each job has an ordered fallback list: a refused or rate-limited key hands the call to the next one.
import OpenAI from 'openai'
import type { ChatCompletionMessage, ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { z } from 'zod'
import { env } from '../env.ts'
import { ApiError } from '../errors.ts'
import { log } from '../log.ts'
import { chainFor, recordFailure, type Route } from './keys.ts'

export type { Route } from './keys.ts'

// Tests point every client at a fake provider by swapping fetch.
export const provider: { fetch: typeof fetch | null } = { fetch: null }
const clients = new Map<string, OpenAI>()

export function clientFor(baseURL: string, apiKey: string): OpenAI {
  // maxRetries 1: the fallback list is the real retry, so a dead key hands over quickly
  const make = () => new OpenAI({ baseURL, apiKey, timeout: env.LLM_TIMEOUT_S * 1000, maxRetries: 1, ...(provider.fetch ? { fetch: provider.fetch } : {}) })
  if (provider.fetch) return make()
  const id = `${baseURL} ${apiKey}`
  if (!clients.has(id)) clients.set(id, make())
  return clients.get(id)!
}

export const routeConfigured = (route: Route) => chainFor(route).length > 0
/** AI is on if a rider-facing job (Snap, Odah Bot, suggestions) has a usable connection. */
export const llmConfigured = () => (['snap', 'tanya', 'reco'] as const).some(routeConfigured)
/** The model the job's first usable connection would use ('' = off). */
export const modelFor = (route: Route) => chainFor(route)[0]?.model ?? ''

const unconfigured = () => new ApiError(503, 'llm_unconfigured', 'Ciri AI belum disediakan. Sila isi secara manual.', "AI features aren't set up. Please enter it manually.")

type Step = ReturnType<typeof chainFor>[number]

/**
 * Runs the call on the job's first usable connection, and on a failure caused by the key or the provider moves to
 * the next. A 400 is our request's fault, so another key wouldn't help; canSwitch() false (a stream already sent
 * text) also stops it.
 */
async function withFallback<R>(route: Route, run: (client: OpenAI, step: Step) => Promise<R>, canSwitch = () => true): Promise<{ result: R; step: Step }> {
  const chain = chainFor(route)
  if (!chain.length) throw unconfigured()
  for (const [i, step] of chain.entries()) {
    try {
      return { result: await run(clientFor(step.conn.baseUrl, step.conn.apiKey), step), step }
    } catch (err) {
      if (err instanceof ApiError) throw err
      const status = err instanceof OpenAI.APIError ? err.status : undefined
      await recordFailure(step.conn.id, status, err instanceof Error ? err.message : String(err))
      if (status === 400 || !canSwitch() || i === chain.length - 1) throw failed(route, err)
      log('warn', 'ai fallback', { route, from: step.conn.name, to: chain[i + 1]!.conn.name, status: status ?? 'network' })
    }
  }
  throw unconfigured() // unreachable: the loop returns or throws
}

function failed(route: Route, err: unknown): ApiError {
  if (err instanceof ApiError) return err
  log('error', 'llm failed', { route, err: err instanceof Error ? err.message : String(err) })
  return new ApiError(502, 'llm_failed', 'AI tidak dapat dihubungi. Cuba lagi atau isi secara manual.', "The AI couldn't be reached. Try again or enter it manually.")
}

/** An image as a message part. Every OpenAI-compatible provider accepts data URLs. */
export const imagePart = (data: Buffer, mime = 'image/jpeg') => ({ type: 'image_url' as const, image_url: { url: `data:${mime};base64,${data.toString('base64')}` } })

export type ChatResult<T> = { message: ChatCompletionMessage; parsed: T; model: string; inputTokens: number; outputTokens: number; connectionId: number | null }

export async function chat<T = undefined>(
  route: Route,
  messages: ChatCompletionMessageParam[],
  opts: { schema?: z.ZodType<T>; tools?: ChatCompletionTool[]; maxTokens?: number } = {},
): Promise<ChatResult<T>> {
  const { result: res, step } = await withFallback(route, async (client, step) => {
    const body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = { model: step.model, messages, max_tokens: opts.maxTokens ?? 1024 }
    if (opts.tools) body.tools = opts.tools
    if (step.reasoning) body.reasoning_effort = step.reasoning as OpenAI.ReasoningEffort
    if (opts.schema) body.response_format = { type: 'json_schema', json_schema: { name: route, schema: z.toJSONSchema(opts.schema) as Record<string, unknown>, strict: false } }
    try {
      return await client.chat.completions.create(body)
    } catch (err) {
      if (!(err instanceof OpenAI.BadRequestError) || !opts.schema) throw err
      // Some providers reject json_schema; the prompt asks for JSON and zod still validates.
      delete body.response_format
      return await client.chat.completions.create(body)
    }
  })
  const message = res.choices[0]!.message
  const parsed = (opts.schema ? parseJson(message.content ?? '', opts.schema) : undefined) as T
  return { message, parsed, model: step.model, inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0, connectionId: step.conn.id }
}

/** Like chat() without a schema, but streamed: onText gets the reply's text as it arrives. Tool calls come back whole. */
export async function chatStream(
  route: Route,
  messages: ChatCompletionMessageParam[],
  opts: { tools?: ChatCompletionTool[]; maxTokens?: number },
  onText: (text: string) => void,
): Promise<ChatResult<undefined>> {
  let sent = false // once the rider has seen text, switching to another provider would repeat or garble it
  const { result, step } = await withFallback(
    route,
    async (client, step) => {
      const body: OpenAI.Chat.ChatCompletionCreateParamsStreaming = { model: step.model, messages, max_tokens: opts.maxTokens ?? 1024, stream: true, stream_options: { include_usage: true } }
      if (opts.tools) body.tools = opts.tools
      if (step.reasoning) body.reasoning_effort = step.reasoning as OpenAI.ReasoningEffort
      let content = ''
      let usage: OpenAI.CompletionUsage | undefined
      const calls: { id: string; name: string; args: string; extra?: unknown }[] = []
      for await (const chunk of await client.chat.completions.create(body)) {
        usage = chunk.usage ?? usage
        const delta = chunk.choices[0]?.delta
        if (delta?.content) {
          content += delta.content
          sent = true
          onText(delta.content)
        }
        for (const tc of delta?.tool_calls ?? []) {
          // OpenAI sends a call in pieces by index; some providers send each call whole with no index
          const call = (calls[tc.index ?? (tc.id ? calls.length : calls.length - 1)] ??= { id: '', name: '', args: '' })
          call.id ||= tc.id ?? ''
          call.name ||= tc.function?.name ?? ''
          call.args += tc.function?.arguments ?? ''
          // Gemini 3 signs each call (extra_content.google.thought_signature) and refuses the next turn without it
          call.extra ??= (tc as { extra_content?: unknown }).extra_content
        }
      }
      return { content, usage, calls }
    },
    () => !sent,
  )
  const message: ChatCompletionMessage = { role: 'assistant', content: result.content, refusal: null }
  if (result.calls.length) {
    message.tool_calls = result.calls.map((c, i) => ({ id: c.id || `call_${i}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' }, ...(c.extra ? { extra_content: c.extra } : {}) }))
  }
  return { message, parsed: undefined, model: step.model, inputTokens: result.usage?.prompt_tokens ?? 0, outputTokens: result.usage?.completion_tokens ?? 0, connectionId: step.conn.id }
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  // Models without native JSON mode often wrap it in ``` fences or add a sentence around it.
  const match = text.match(/\{[\s\S]*\}/)
  try {
    return schema.parse(JSON.parse(match ? match[0] : text))
  } catch {
    throw new ApiError(502, 'llm_bad_output', 'AI memberi jawapan yang tidak sah. Sila isi secara manual.', 'The AI gave an invalid answer. Please enter it manually.')
  }
}
