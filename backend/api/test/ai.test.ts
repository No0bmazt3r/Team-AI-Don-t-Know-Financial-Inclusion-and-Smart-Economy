import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { db, schema } from '../src/db/index.ts'
import { env } from '../src/env.ts'
import { chat, provider } from '../src/llm/client.ts'
import { ai, decryptKey, describeAi, encryptKey, loadAi } from '../src/llm/keys.ts'
import { type Agent, rider } from './helpers.ts'

// A fake world of providers: each host answers chat with the status set here (200 = a normal reply)
function providers(statusByHost: Record<string, number>) {
  const calls: string[] = []
  provider.fetch = (async (url: string | URL | Request) => {
    const u = new URL(String(url))
    calls.push(u.host)
    const status = statusByHost[u.host] ?? 200
    if (status !== 200) return new Response(JSON.stringify({ error: { message: `fake ${status}` } }), { status, headers: { 'content-type': 'application/json' } })
    if (u.pathname.endsWith('/models')) return Response.json({ object: 'list', data: [{ id: 'model-b', object: 'model' }, { id: 'model-a', object: 'model' }] })
    return Response.json({ id: 'x', object: 'chat.completion', created: 0, model: 'm', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: `hi from ${u.host}` } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  }) as typeof fetch
  return calls
}

async function admin(): Promise<Agent> {
  const a = await rider()
  const me = (await a.get('/api/auth/me')).body.user
  await db.update(schema.users).set({ isDemo: false, email: 'admin@example.com' }).where(eq(schema.users.id, Number(me.id)))
  return a
}

const conn = (name: string, host: string, apiKey: string) => ({ name, baseUrl: `https://${host}/v1/`, apiKey, providerName: `${name} Inc`, regionNote: `${name} is in the US.` })

test('keys are encrypted at rest, and a different master key reads nothing', () => {
  const stored = encryptKey('sk-secret-1234')
  expect(stored).toMatch(/^v1:/)
  expect(stored).not.toContain('secret')
  expect(decryptKey(stored)).toBe('sk-secret-1234')
  const keep = env.AI_KEYS_MASTER_KEY
  env.AI_KEYS_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')
  expect(decryptKey(stored)).toBeNull()
  env.AI_KEYS_MASTER_KEY = keep
})

test('only admins see the AI keys page', async () => {
  const a = await rider()
  expect((await a.get('/api/admin/ai')).status).toBe(404)
  expect((await a.post('/api/admin/ai/connections').send(conn('A', 'a.example', 'sk-aaaa-1111'))).status).toBe(404)
})

test('an admin adds keys, sets a fallback list, and a refused or limited key hands over to the next', async () => {
  providers({})
  const a = await admin()

  const added = await a.post('/api/admin/ai/connections').send(conn('Groq', 'a.example', 'sk-groq-key-1111'))
  expect(added.status).toBe(201)
  expect(added.body.test).toEqual({ ok: true, error: null, checked: 'models' }) // no job uses it yet
  const b = (await a.post('/api/admin/ai/connections').send(conn('Gemini', 'b.example', 'sk-gemini-key-2222'))).body.id
  const groq = added.body.id

  // The key never comes back, only its last 4
  const page = await a.get('/api/admin/ai')
  expect(JSON.stringify(page.body)).not.toContain('sk-groq')
  expect(page.body.connections[0]).toMatchObject({ name: 'Groq', baseUrl: 'https://a.example/v1', keyLast4: '1111', status: 'ok', decryptable: true })
  expect((await db.select().from(schema.aiConnections).where(eq(schema.aiConnections.id, groq)))[0]!.keyEnc).not.toContain('sk-groq')

  expect((await a.put('/api/admin/ai/jobs/tanya').send([{ connectionId: groq, model: 'model-a' }, { connectionId: b, model: 'model-b', reasoning: 'low' }])).status).toBe(204)
  expect((await a.put('/api/admin/ai/jobs/tanya').send([{ connectionId: 999, model: 'x' }])).status).toBe(422)
  expect((await a.get('/api/admin/ai/connections/' + groq + '/models')).body.models).toEqual(['model-a', 'model-b'])

  // First key rate-limited: the call still succeeds on the second, and the first cools down
  providers({ 'a.example': 429 })
  let r = await chat('tanya', [{ role: 'user', content: 'hi' }])
  expect(r.message.content).toBe('hi from b.example')
  expect(r.connectionId).toBe(b)
  expect(ai.conns.get(groq)!.status).toBe('cooling')
  const row = (await db.select().from(schema.aiConnections).where(eq(schema.aiConnections.id, groq)))[0]!
  expect(row.status).toBe('cooling')
  expect(row.lastError).toContain('429')
  r = await chat('tanya', [])
  expect(r.connectionId).toBe(b) // skipped while cooling, no wasted call

  // Second key revoked too: nothing left, so the rider gets the usual "AI not reachable"
  providers({ 'b.example': 401 })
  await expect(chat('tanya', [])).rejects.toMatchObject({ status: 502, code: 'llm_failed' })
  expect(ai.conns.get(b)!.status).toBe('failing')
  await expect(chat('tanya', [])).rejects.toMatchObject({ status: 503, code: 'llm_unconfigured' }) // both skipped now

  // Replacing the key re-tests it with the job's model and clears "failing"
  providers({ 'a.example': 429 })
  const fixed = await a.patch('/api/admin/ai/connections/' + b).send({ apiKey: 'sk-gemini-new-3333' })
  expect(fixed.body.test).toEqual({ ok: true, error: null, checked: 'chat' })
  expect(ai.conns.get(b)!.status).toBe('ok')

  // The privacy page names every provider a job can use
  const meta = (await a.get('/api/meta')).body
  expect(meta).toMatchObject({ llmEnabled: true, llmProvider: 'Groq Inc, Gemini Inc' })

  // Every change is in the audit log, with no key in it
  const audit = (await a.get('/api/admin/ai')).body.audit
  expect(audit.map((x: { action: string }) => x.action)).toEqual(['connection.edit', 'job.set', 'connection.add', 'connection.add'])
  expect(audit[0].detail).toContain('…2222 → …3333')
  expect(JSON.stringify(audit)).not.toContain('sk-')

  // The startup log line shows the chain without the key
  await loadAi()
  expect(describeAi()[1]).toBe('tanya: Groq (…1111) model-a [cooling] → Gemini (…3333) model-b')
  expect(describeAi().join(' ')).not.toContain('sk-')

  // Deleting a connection takes it out of every job
  expect((await a.delete('/api/admin/ai/connections/' + groq)).status).toBe(204)
  expect(ai.jobs.tanya.map((s) => s.connectionId)).toEqual([b])
})

test('without a master key nothing can be stored', async () => {
  providers({})
  const a = await admin()
  env.AI_KEYS_MASTER_KEY = ''
  const res = await a.post('/api/admin/ai/connections').send(conn('A', 'a.example', 'sk-aaaa-1111'))
  expect(res.status).toBe(409)
  expect(res.body.error.code).toBe('no_master_key')
  expect((await a.get('/api/admin/ai')).body.masterKeySet).toBe(false)
})

test('a provider address must be https (or this machine)', async () => {
  const a = await admin()
  expect((await a.post('/api/admin/ai/connections').send({ ...conn('A', 'x', 'sk-aaaa-1111'), baseUrl: 'http://evil.example/v1' })).status).toBe(422)
})
