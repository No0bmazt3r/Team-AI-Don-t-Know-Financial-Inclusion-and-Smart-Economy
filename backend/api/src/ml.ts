// Typed client for the Python ML service (backend/ml/app/service.py): the engine, our BM classifier and the Penyata renderer.
import type { EngineResult } from './db/schema.ts'
import { env } from './env.ts'
import { ApiError } from './errors.ts'
import { errorFields, log } from './log.ts'

export type Bill = { name: string; amountSen: number; frequency: string; dueDay: number | null; dueDate: string | null }
export type Leave = { startWeek: string; weeks: number; setAsideWeekSen: number; fraction?: number }
export type LeavePart = { week: string; fraction: number }

export type Inputs = {
  weekStart: string
  lastWeekNetSen: number
  history: { netSen: number; hours: number | null; weekStart: string }[] // oldest first; the date drives the season adjustment
  platforms: string[]
  city: string | null
  defaultHours: number | null
  bufferSen: number
  cutiSen: number
  bills: Bill[]
  leaves: Leave[]
  essentialsWeekSen: number
  reservesWeekSen: number
  seed: number
}

export type Scenario = { hours?: number | null; addMonthlySen?: number; oneOffSen?: number; oneOffWeek?: number; leaves?: Leave[] }
export type Risk = EngineResult['risk']

export type JurangResult =
  | { active: false }
  | {
      active: true
      essentialsSen: number
      salarySen: number
      gapSen: number
      hours: { plannedHours: number; hours: number; extraHours: number; salarySen: number; closesGap: boolean; fatigue: boolean }
      costs: { cutSen: number; essentialsAfterSen: number }
    }

export type LeavePreview = { weeksUntil: number; setAsideWeekSen: number; salarySen: number; salaryDeltaSen: number; pSafe: number; risk: Risk }
export type CostParse = { amountSen: number | null; category: string | null; tier: string; confidence: number; needsLlm: boolean }

async function call(path: string, body: unknown): Promise<Response> {
  const pdf = body instanceof Uint8Array
  let res: Response
  try {
    res = await fetch(`${env.ML_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': pdf ? 'application/pdf' : 'application/json', 'X-ML-Token': env.ML_TOKEN },
      body: pdf ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    log('error', 'ml unreachable', errorFields(err))
    throw new ApiError(503, 'engine_down', 'Enjin sedang berehat. Cuba sebentar lagi.', 'The engine is resting. Try again shortly.')
  }
  if (!res.ok) {
    log('error', 'ml failed', { path, status: res.status, body: (await res.text()).slice(0, 500) })
    throw new ApiError(502, 'engine_failed', 'Enjin tak dapat mengira. Cuba lagi.', "The engine couldn't calculate. Try again.")
  }
  return res
}

const json = async <T>(path: string, body: unknown) => (await (await call(path, body)).json()) as T

export const ml = {
  solve: (inputs: Inputs, scenario?: Scenario, prev?: EngineResult | null) => json<EngineResult>('/solve', { inputs, scenario, prev: prev ?? null }),
  pSafe: (inputs: Inputs, salarySen: number, scenario: Scenario) => json<{ pSafe: number; risk: Risk }>('/p-safe', { inputs, salarySen, scenario }),
  jurang: (inputs: Inputs) => json<JurangResult>('/jurang', { inputs }),
  leavePreview: (inputs: Inputs, parts: LeavePart[]) => json<LeavePreview>('/leave-preview', { inputs, startWeek: parts[0]!.week, parts }),
  parseCost: (text: string) => json<CostParse>('/bm/parse', { text, threshold: env.BM_CLASSIFIER_THRESHOLD }),
  penyataHtml: async (body: PenyataBody) => (await call('/penyata', { ...body, format: 'html' })).text(),
  statementLines: async (pdf: Uint8Array) => {
    try {
      return (await json<{ lines: string[] }>('/statement/text', pdf)).lines
    } catch (err) {
      if (err instanceof ApiError && err.code === 'engine_failed') throw new ApiError(422, 'statement_unreadable', 'Penyata ini tak dapat dibaca. Cuba PDF lain (bukan gambar, tanpa kata laluan).', "This statement can't be read. Try another PDF (not a scan, no password).")
      throw err
    }
  },
  penyataPdf: async (body: PenyataBody) => Buffer.from(await (await call('/penyata', { ...body, format: 'pdf' })).arrayBuffer()),
}

export type PenyataBody = { data: unknown; lang: 'ms' | 'en'; name: string; generated: string; expires?: string | null; kind?: 'loan' | 'tax'; code?: string; verifyUrl?: string; verified?: boolean }
