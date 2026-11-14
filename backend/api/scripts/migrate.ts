// Checks the database and its migrations. The "Database (Supabase)" workflow runs it; run it before deploying new code.
//   node --env-file=../.env scripts/migrate.ts --check   reachable? which migrations are pending? (changes nothing)
//   node --env-file=../.env scripts/migrate.ts           the same, then applies the pending ones
// "Pending" uses Drizzle's own rule: a migration newer than the newest one recorded in drizzle.__drizzle_migrations.
import { appendFileSync, readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { closeDb, db, migrate } from '../src/db/index.ts'

const check = process.argv.includes('--check')
const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')) as { entries: { tag: string; when: number }[] }
const output = (line: string) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
const summary = (line: string) => process.env.GITHUB_STEP_SUMMARY && appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`)

async function newestApplied(): Promise<number> {
  try {
    const { rows } = (await db.execute(sql`select max(created_at) as at from drizzle.__drizzle_migrations`)) as unknown as { rows: { at: string | null }[] }
    return Number(rows[0]?.at ?? 0)
  } catch {
    return 0 // no migrations table yet: a brand-new database, everything is pending
  }
}

try {
  // 1. Is the database reachable? (A paused Supabase project fails here.)
  try {
    const { rows } = (await db.execute(sql`select current_database() as name, version() as version`)) as unknown as { rows: { name: string; version: string }[] }
    console.log(`database reachable: ${rows[0]!.name} (${rows[0]!.version.split(' ').slice(0, 2).join(' ')})`)
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err // Drizzle wraps the driver's error
    console.error(`database NOT reachable: ${cause instanceof Error ? cause.message : String(cause)}`)
    console.error('Check DATABASE_URL and that the database is reachable from here (on AWS it only accepts connections from inside its VPC).')
    summary('❌ Database not reachable. If the Supabase project is paused, restore it in the dashboard.')
    process.exitCode = 1
  }
  if (process.exitCode) throw new Error('stopping: database not reachable')

  // 2. Which migrations haven't been applied?
  const applied = await newestApplied()
  const pending = journal.entries.filter((m) => m.when > applied)
  console.log(`migrations: ${journal.entries.length} in the repo, ${pending.length} pending${pending.length ? `: ${pending.map((m) => m.tag).join(', ')}` : ''}`)
  output(`pending=${pending.length}`)
  summary(`Database reachable · ${pending.length} pending migration(s)${pending.length ? ': ' + pending.map((m) => `\`${m.tag}\``).join(', ') : ''}`)

  // 3. Apply them (unless only checking)
  if (!check && pending.length) {
    await migrate()
    const after = await newestApplied()
    const still = journal.entries.filter((m) => m.when > after)
    if (still.length) throw new Error(`still pending after migrating: ${still.map((m) => m.tag).join(', ')}`)
    console.log(`applied ${pending.length} migration(s)`)
    summary(`✅ Applied ${pending.length} migration(s)`)
  }
} catch (err) {
  if (!process.exitCode) console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
} finally {
  await closeDb()
}
