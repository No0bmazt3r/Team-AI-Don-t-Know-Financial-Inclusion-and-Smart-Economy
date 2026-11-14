import { sql } from 'drizzle-orm'
import { beforeAll, beforeEach } from 'vitest'
import { db, migrate } from '../src/db/index.ts'
import { env } from '../src/env.ts'
import { provider } from '../src/llm/client.ts'
import { resetAi } from '../src/llm/keys.ts'

// Tests only ever run on throwaway databases: in-memory PGlite or the CI Postgres. Never the developer's backend/api/.pglite.
if (env.DATABASE_URL !== 'memory://' && !env.DATABASE_URL.startsWith('postgres')) {
  throw new Error(`Tests refuse DATABASE_URL="${env.DATABASE_URL}": use memory:// or a test Postgres (TEST_DATABASE_URL)`)
}

beforeAll(async () => {
  await migrate()
})

beforeEach(async () => {
  provider.fetch = null
  resetAi() // tests that fake an LLM set it up again (helpers.ts fakeLlm)
  Object.assign(env, { AI_KEYS_MASTER_KEY: Buffer.alloc(32, 7).toString('base64') }) // a fixed test-only key
  const result = (await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '%drizzle%'`)) as unknown as { rows: { tablename: string }[] }
  const rows = result.rows
  await db.execute(sql.raw(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`))
  // The row fakeLlm's in-memory connection stands for (llm_usage.connection_id points at it)
  await db.execute(sql`INSERT INTO ai_connections (id, name, base_url, key_enc, key_last4, provider_name) OVERRIDING SYSTEM VALUE VALUES (900001, 'fake', 'http://fake/v1', 'v1:x:x:x', 'fake', 'Fake AI')`)
})
