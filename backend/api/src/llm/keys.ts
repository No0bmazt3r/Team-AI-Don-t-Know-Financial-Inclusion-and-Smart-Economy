// The AI connections and each job's fallback list, as the admins set them in /admin/ai.
// Stored in the database (keys encrypted with AI_KEYS_MASTER_KEY); held in memory so a call never waits on a query.
// ponytail: in-memory copy, refreshed after every admin write. Fine with one API task; reload per request (or LISTEN)
// if the backend ever runs more than one.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.ts'
import { env } from '../env.ts'
import { log } from '../log.ts'

export const JOBS = ['snap', 'tanya', 'lender', 'bm', 'reco'] as const
export type Route = (typeof JOBS)[number]

export type Conn = {
  id: number
  name: string
  baseUrl: string
  apiKey: string | null // null: stored but can't be decrypted (AI_KEYS_MASTER_KEY changed or unset)
  providerName: string
  regionNote: string
  status: 'ok' | 'cooling' | 'failing'
  coolingUntil: Date | null
}
export type Step = { connectionId: number; model: string; reasoning: string | null }

export const COOL_MS = 10 * 60_000 // a rate- or quota-limited key is skipped this long

/** What the running API uses. Tests may set it directly (helpers.ts fakeLlm). */
export const ai: { conns: Map<number, Conn>; jobs: Record<Route, Step[]> } = { conns: new Map(), jobs: emptyJobs() }

function emptyJobs(): Record<Route, Step[]> {
  return { snap: [], tanya: [], lender: [], bm: [], reco: [] }
}

// ---------------------------------------------------------------- encryption (AES-256-GCM, "v1:iv:tag:ciphertext")

function masterKey(): Buffer | null {
  const key = Buffer.from(env.AI_KEYS_MASTER_KEY, 'base64')
  return key.length === 32 ? key : null
}
export const masterKeySet = () => masterKey() !== null

export function encryptKey(plain: string): string {
  const key = masterKey()
  if (!key) throw new Error('AI_KEYS_MASTER_KEY is not a base64 32-byte key')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64'))).join(':')
}

export function decryptKey(stored: string): string | null {
  const key = masterKey()
  const [v, iv, tag, data] = stored.split(':')
  if (!key || v !== 'v1' || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null // wrong master key, or tampered
  }
}

// ---------------------------------------------------------------- loading and using the config

export async function loadAi() {
  const [conns, steps] = await Promise.all([
    db.select().from(schema.aiConnections),
    db.select().from(schema.aiSteps).orderBy(asc(schema.aiSteps.job), asc(schema.aiSteps.position)),
  ])
  ai.conns = new Map(
    conns.map((c) => [
      c.id,
      { id: c.id, name: c.name, baseUrl: c.baseUrl, apiKey: decryptKey(c.keyEnc), providerName: c.providerName, regionNote: c.regionNote, status: c.status as Conn['status'], coolingUntil: c.coolingUntil },
    ]),
  )
  ai.jobs = emptyJobs()
  for (const s of steps) if (s.job in ai.jobs) ai.jobs[s.job as Route].push({ connectionId: s.connectionId, model: s.model, reasoning: s.reasoning })
}

export function resetAi() {
  ai.conns = new Map()
  ai.jobs = emptyJobs()
}

export const usable = (c: Conn | undefined, now = Date.now()): c is Conn & { apiKey: string } =>
  Boolean(c?.apiKey) && c!.status !== 'failing' && !(c!.status === 'cooling' && c!.coolingUntil && c!.coolingUntil.getTime() > now)

/** The job's fallback list, skipping connections that are failing, cooling down or undecryptable. */
export function chainFor(route: Route): (Step & { conn: Conn & { apiKey: string } })[] {
  return ai.jobs[route].flatMap((s) => {
    const conn = ai.conns.get(s.connectionId)
    return usable(conn) ? [{ ...s, conn }] : []
  })
}

/** The connections at least one job uses: the privacy page names each of them. */
export function providersInUse(): Conn[] {
  const ids = new Set(Object.values(ai.jobs).flatMap((steps) => steps.map((s) => s.connectionId)))
  return [...ids].flatMap((id) => (ai.conns.has(id) ? [ai.conns.get(id)!] : []))
}

/**
 * How a failed call should change the connection: a refused key (401/403) is failing until someone fixes it; a rate
 * or quota limit (429/402) cools down for COOL_MS; anything else is just recorded.
 */
export function classify(status: number | undefined): Conn['status'] | null {
  if (status === 401 || status === 403) return 'failing'
  if (status === 429 || status === 402) return 'cooling'
  return null
}

export async function recordFailure(id: number, status: number | undefined, message: string) {
  const next = classify(status)
  const conn = ai.conns.get(id)
  const coolingUntil = next === 'cooling' ? new Date(Date.now() + COOL_MS) : null
  if (conn && next) Object.assign(conn, { status: next, coolingUntil })
  const lastError = `${status ?? 'network'}: ${message}`.slice(0, 300)
  await db
    .update(schema.aiConnections)
    .set({ ...(next ? { status: next, coolingUntil } : {}), lastError, lastErrorAt: new Date() })
    .where(eq(schema.aiConnections.id, id))
    .catch((err) => log('error', 'could not save the AI connection status', { id, err: String(err) }))
}

/** One line per job for the startup log: never a key, only its last 4 characters. */
export function describeAi(): string[] {
  return JOBS.map((job) => {
    const steps = ai.jobs[job]
    if (!steps.length) return `${job}: off`
    return `${job}: ` + steps.map((s) => {
      const c = ai.conns.get(s.connectionId)
      return `${c?.name ?? '?'} (…${c?.apiKey?.slice(-4) ?? '????'}) ${s.model}${usable(c) ? '' : ` [${c?.apiKey ? c.status : 'undecryptable'}]`}`
    }).join(' → ')
  })
}
