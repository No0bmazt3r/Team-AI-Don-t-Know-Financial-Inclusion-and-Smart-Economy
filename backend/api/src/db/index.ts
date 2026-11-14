import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { env } from '../env.ts'
import * as schema from './schema.ts'

// Postgres everywhere: real Postgres in production, PGlite (Postgres compiled to WASM) locally and in tests,
// so there's one SQL dialect and no setup for a fresh clone.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url))
const DEFAULT_DIR = fileURLToPath(new URL('../../.pglite', import.meta.url))

function connect(): { db: Db; migrate: () => Promise<void>; close: () => Promise<void>; serve?: (port: number) => Promise<string> } {
  if (env.DATABASE_URL.startsWith('postgres')) {
    // TLS for any remote database, always verified. Amazon RDS's CA comes from NODE_EXTRA_CA_CERTS (backend/Dockerfile).
    // Put no sslmode in the URL: node-postgres lets the URL's sslmode override these settings.
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(env.DATABASE_URL)
    const ssl = local ? undefined : { rejectUnauthorized: true }
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10, ssl })
    const db = drizzlePg(pool, { schema })
    return { db, migrate: () => migratePg(db, { migrationsFolder: MIGRATIONS }), close: () => pool.end() }
  }
  const memory = env.DATABASE_URL === 'memory://'
  const client = new PGlite(memory ? undefined : env.DATABASE_URL || DEFAULT_DIR)
  const db = drizzlePglite(client, { schema })
  let stopSocket = async () => {}
  // Local PGlite can also accept ordinary Postgres connections (DBeaver, psql) while the API runs. Dev only: the
  // package is a dev dependency and production always uses DATABASE_URL=postgres://….
  const serve = async (port: number) => {
    const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket')
    const server = new PGLiteSocketServer({ db: client, port, host: '127.0.0.1', maxConnections: 4 }) // DBeaver opens 2–3
    await server.start()
    stopSocket = () => server.stop()
    return `postgres://postgres@127.0.0.1:${port}/postgres`
  }
  return {
    db,
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS }),
    close: async () => { await stopSocket(); await client.close() },
    serve: memory ? undefined : serve,
  }
}

const conn = connect()
export const db = conn.db
export const migrate = conn.migrate
/** Flush and close the database. PGlite in particular must close cleanly, or its files are left unreadable. */
export const closeDb = conn.close
/** Open the local PGlite to Postgres clients on this port. Undefined on real Postgres and in tests. */
export const serveDb = conn.serve
export { schema }
