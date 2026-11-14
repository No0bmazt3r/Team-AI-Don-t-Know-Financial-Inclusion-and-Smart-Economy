// Every LLM call is logged (llm_usage) and capped per rider per day and for everyone per month.
import { and, count, eq, gte } from 'drizzle-orm'
import { db, schema } from '../db/index.ts'
import { env } from '../env.ts'
import { ApiError } from '../errors.ts'
import { klMidnight, todayKL } from '../lib/weeks.ts'
import type { ChatResult, Route } from './client.ts'

const DAILY: Record<Route, () => number> = { snap: () => env.LLM_DAILY_SNAP, tanya: () => env.LLM_DAILY_TANYA, lender: () => env.LLM_DAILY_LENDER, bm: () => env.LLM_DAILY_BM, reco: () => env.LLM_DAILY_RECO }

export async function checkQuota(userId: number, route: Route, calls = 1) {
  const today = todayKL()
  const [used] = await db
    .select({ n: count() })
    .from(schema.llmUsage)
    .where(and(eq(schema.llmUsage.userId, userId), eq(schema.llmUsage.route, route), gte(schema.llmUsage.createdAt, klMidnight(today))))
  const [total] = await db
    .select({ n: count() })
    .from(schema.llmUsage)
    .where(gte(schema.llmUsage.createdAt, klMidnight(`${today.slice(0, 7)}-01`)))
  if ((used?.n ?? 0) + calls > DAILY[route]()) {
    throw new ApiError(429, 'llm_quota', 'Had harian AI dicapai. Sila isi secara manual atau cuba esok.', 'Daily AI limit reached. Please enter it manually or try tomorrow.')
  }
  if ((total?.n ?? 0) + calls > env.LLM_MONTHLY_CALL_CAP) {
    throw new ApiError(429, 'llm_budget', 'Ciri AI berehat bulan ini. Sila isi secara manual.', 'AI features are paused this month. Please enter it manually.')
  }
}

export async function logUsage(userId: number | null, route: Route, r: ChatResult<unknown>) {
  await db.insert(schema.llmUsage).values({ userId, route, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, connectionId: r.connectionId })
}
