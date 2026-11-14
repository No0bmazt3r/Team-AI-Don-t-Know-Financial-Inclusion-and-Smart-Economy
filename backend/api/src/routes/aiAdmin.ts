// /admin/ai: the AI connections (provider address + key) and each job's fallback list. ADMIN_EMAILS only.
// Keys go in and never come out: responses carry only the last 4 characters. Every change is written to ai_audit.
import { type NextFunction, type Request, type Response, Router } from 'express'
import OpenAI from 'openai'
import { and, asc, desc, eq, gte, isNotNull, max, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isAdmin, requireUser, userOf } from '../auth.ts'
import { db, schema } from '../db/index.ts'
import { ApiError, notFound } from '../errors.ts'
import { klMidnight, todayKL } from '../lib/weeks.ts'
import { clientFor } from '../llm/client.ts'
import { ai, classify, encryptKey, JOBS, loadAi, masterKeySet, type Route } from '../llm/keys.ts'

export const aiAdminRouter = Router()

aiAdminRouter.use(requireUser, (_req: Request, res: Response, next: NextFunction) => {
  const user = userOf(res)
  if (!isAdmin(user.email, user.isDemo)) throw notFound() // don't reveal that the page exists
  next()
})

// https only, except a provider on this machine (Ollama, LM Studio) during development
const BaseUrl = z
  .url()
  .max(300)
  .transform((u) => u.replace(/\/+$/, ''))
  .refine((u) => {
    const { protocol, hostname } = new URL(u)
    return protocol === 'https:' || (protocol === 'http:' && ['localhost', '127.0.0.1'].includes(hostname))
  }, 'https only')
const Text = (maxLen: number) => z.string().trim().max(maxLen)
const ConnectionIn = z.strictObject({
  name: Text(60).min(1),
  baseUrl: BaseUrl,
  apiKey: z.string().trim().min(8).max(500),
  providerName: Text(80).min(1),
  regionNote: Text(400).default(''),
})
const Steps = z
  .array(z.strictObject({ connectionId: z.number().int().positive(), model: Text(120).min(1), reasoning: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'default']).nullable().default(null) }))
  .max(6)
const IdParam = z.coerce.number().int().positive()

const noMasterKey = () => new ApiError(409, 'no_master_key', 'AI_KEYS_MASTER_KEY belum ditetapkan, jadi kunci tidak boleh disimpan.', "AI_KEYS_MASTER_KEY isn't set, so keys can't be stored.")

async function audit(res: Response, action: string, detail: string) {
  await db.insert(schema.aiAudit).values({ actorEmail: userOf(res).email, action, detail })
}

async function connectionOr404(id: number) {
  const [row] = await db.select().from(schema.aiConnections).where(eq(schema.aiConnections.id, id))
  if (!row) throw notFound()
  return row
}

/**
 * A real call with the key: one token with the first model a job uses it for, or, if no job uses it yet, the model
 * list. Saves the result as the connection's status. (Some providers serve /models without checking the key, so a
 * connection is only fully proven once a job uses it.)
 */
async function test(id: number): Promise<{ ok: boolean; error: string | null; checked: 'chat' | 'models' }> {
  await loadAi()
  const conn = ai.conns.get(id)
  if (!conn) throw notFound()
  const model = JOBS.flatMap((j) => ai.jobs[j]).find((s) => s.connectionId === id)?.model
  const checked = model ? 'chat' : 'models'
  let error: string | null = null
  let status: number | undefined
  if (!conn.apiKey) error = "can't decrypt: re-enter the key"
  else {
    try {
      const client = clientFor(conn.baseUrl, conn.apiKey)
      if (model) await client.chat.completions.create({ model, messages: [{ role: 'user', content: 'ok' }], max_tokens: 1 })
      else await client.models.list()
    } catch (err) {
      status = err instanceof OpenAI.APIError ? err.status : undefined
      error = `${status ?? 'network'}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300)
    }
  }
  await db
    .update(schema.aiConnections)
    .set(error ? { status: classify(status) ?? 'failing', coolingUntil: classify(status) === 'cooling' ? new Date(Date.now() + 10 * 60_000) : null, lastError: error, lastErrorAt: new Date() } : { status: 'ok', coolingUntil: null })
    .where(eq(schema.aiConnections.id, id))
  await loadAi()
  return { ok: !error, error, checked }
}

aiAdminRouter.get('/', async (_req, res) => {
  const today = klMidnight(todayKL())
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)
  const u = schema.llmUsage
  const [conns, steps, stats, log] = await Promise.all([
    db.select().from(schema.aiConnections).orderBy(asc(schema.aiConnections.id)),
    db.select().from(schema.aiSteps).orderBy(asc(schema.aiSteps.job), asc(schema.aiSteps.position)),
    db
      .select({
        id: u.connectionId,
        today: sql<number>`count(*) filter (where ${u.createdAt} >= ${today})`.mapWith(Number),
        week: sql<number>`count(*)`.mapWith(Number),
        lastOk: max(u.createdAt),
      })
      .from(u)
      .where(and(isNotNull(u.connectionId), gte(u.createdAt, weekAgo)))
      .groupBy(u.connectionId),
    db.select().from(schema.aiAudit).orderBy(desc(schema.aiAudit.id)).limit(50),
  ])
  const byId = new Map(stats.map((s) => [s.id, s]))
  res.json({
    masterKeySet: masterKeySet(),
    connections: conns.map((c) => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      keyLast4: c.keyLast4,
      providerName: c.providerName,
      regionNote: c.regionNote,
      status: c.status === 'cooling' && c.coolingUntil && c.coolingUntil < new Date() ? 'ok' : c.status,
      coolingUntil: c.coolingUntil,
      decryptable: Boolean(ai.conns.get(c.id)?.apiKey),
      lastError: c.lastError,
      lastErrorAt: c.lastErrorAt,
      callsToday: byId.get(c.id)?.today ?? 0,
      calls7d: byId.get(c.id)?.week ?? 0,
      lastSuccessAt: byId.get(c.id)?.lastOk ?? null,
    })),
    jobs: Object.fromEntries(JOBS.map((j) => [j, steps.filter((s) => s.job === j).map(({ connectionId, model, reasoning }) => ({ connectionId, model, reasoning }))])),
    audit: log.map(({ actorEmail, action, detail, createdAt }) => ({ actorEmail, action, detail, at: createdAt })),
  })
})

aiAdminRouter.post('/connections', async (req, res) => {
  if (!masterKeySet()) throw noMasterKey()
  const c = ConnectionIn.parse(req.body)
  const [row] = await db
    .insert(schema.aiConnections)
    .values({ name: c.name, baseUrl: c.baseUrl, keyEnc: encryptKey(c.apiKey), keyLast4: c.apiKey.slice(-4), providerName: c.providerName, regionNote: c.regionNote })
    .returning({ id: schema.aiConnections.id })
  await audit(res, 'connection.add', `${c.name} (${new URL(c.baseUrl).host}, key …${c.apiKey.slice(-4)})`)
  res.status(201).json({ id: row!.id, test: await test(row!.id) })
})

aiAdminRouter.patch('/connections/:id', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  const before = await connectionOr404(id)
  const c = ConnectionIn.partial().parse(req.body)
  if (c.apiKey && !masterKeySet()) throw noMasterKey()
  const changed = Object.keys(c).filter((k) => k !== 'apiKey' && c[k as keyof typeof c] !== before[k as keyof typeof before])
  await db
    .update(schema.aiConnections)
    .set({
      ...(c.name !== undefined && { name: c.name }),
      ...(c.baseUrl !== undefined && { baseUrl: c.baseUrl }),
      ...(c.providerName !== undefined && { providerName: c.providerName }),
      ...(c.regionNote !== undefined && { regionNote: c.regionNote }),
      ...(c.apiKey && { keyEnc: encryptKey(c.apiKey), keyLast4: c.apiKey.slice(-4) }),
      updatedAt: new Date(),
    })
    .where(eq(schema.aiConnections.id, id))
  const what = [...changed, ...(c.apiKey ? [`key …${before.keyLast4} → …${c.apiKey.slice(-4)}`] : [])]
  await audit(res, 'connection.edit', `${c.name ?? before.name}: ${what.join(', ') || 'no change'}`)
  res.json({ test: await test(id) }) // an edit re-tests, which also clears "failing" once the key works
})

aiAdminRouter.delete('/connections/:id', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  const before = await connectionOr404(id)
  await db.delete(schema.aiConnections).where(eq(schema.aiConnections.id, id)) // its job steps go with it
  await audit(res, 'connection.delete', `${before.name} (key …${before.keyLast4})`)
  await loadAi()
  res.status(204).end()
})

aiAdminRouter.post('/connections/:id/test', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  await connectionOr404(id)
  res.json(await test(id))
})

// The provider's model list, for suggestions in the job editor
aiAdminRouter.get('/connections/:id/models', async (req, res) => {
  const id = IdParam.parse(req.params.id)
  await connectionOr404(id)
  const conn = ai.conns.get(id)
  if (!conn?.apiKey) throw new ApiError(409, 'undecryptable', 'Kunci tidak dapat dibaca. Masukkan semula.', "The key can't be read. Re-enter it.")
  try {
    const ids: string[] = []
    for await (const m of clientFor(conn.baseUrl, conn.apiKey).models.list()) if (ids.push(m.id) >= 1000) break
    res.json({ models: ids.sort() })
  } catch (err) {
    const status = err instanceof OpenAI.APIError ? err.status : undefined
    throw new ApiError(502, 'models_failed', `Senarai model gagal (${status ?? 'rangkaian'}).`, `Couldn't load the model list (${status ?? 'network'}).`)
  }
})

aiAdminRouter.put('/jobs/:job', async (req, res) => {
  const job = z.enum(JOBS).parse(req.params.job) as Route
  const steps = Steps.parse(req.body)
  const known = new Set((await db.select({ id: schema.aiConnections.id }).from(schema.aiConnections)).map((r) => r.id))
  if (steps.some((s) => !known.has(s.connectionId))) throw new ApiError(422, 'unknown_connection', 'Sambungan tidak wujud.', "That connection doesn't exist.")
  await db.transaction(async (tx) => {
    await tx.delete(schema.aiSteps).where(eq(schema.aiSteps.job, job))
    if (steps.length) await tx.insert(schema.aiSteps).values(steps.map((s, position) => ({ job, position, ...s })))
  })
  await loadAi()
  const names = steps.map((s) => `${ai.conns.get(s.connectionId)?.name ?? s.connectionId} ${s.model}${s.reasoning ? ` (${s.reasoning})` : ''}`)
  await audit(res, 'job.set', `${job}: ${names.join(' → ') || 'off'}`)
  res.status(204).end()
})
