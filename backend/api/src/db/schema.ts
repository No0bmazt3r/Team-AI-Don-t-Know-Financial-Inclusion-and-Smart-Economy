// All the tables. Money is stored in sen (whole numbers). Weeks are their Monday date in Malaysian time.
// Deleting a user deletes everything they own.
import { sql } from 'drizzle-orm'
import { boolean, check, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

const id = () => integer().primaryKey().generatedAlwaysAsIdentity()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const owner = () =>
  integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })

export const users = pgTable('users', {
  id: id(),
  googleSub: text('google_sub').unique(), // Google's stable id; null for demo users
  email: text().notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  // Profile. Null until onboarding asks.
  lang: text().notNull().default('ms'),
  theme: text().notNull().default('system'), // system | light | dark
  city: text(),
  paydayWeekday: integer('payday_weekday'), // 0 = Monday
  lastReminderWeek: date('last_reminder_week', { mode: 'string' }), // the week the payday reminder last went out
  defaultHours: integer('default_hours'),
  essentialsWeekSen: integer('essentials_week_sen'),
  pocketReady: boolean('pocket_ready').notNull().default(false),
  sickDaysCovered: integer('sick_days_covered').notNull().default(3),
  accent: text().notNull().default('lime'), // app colour, unlocked by streak level
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  seenTips: jsonb('seen_tips').$type<string[]>().notNull().default([]), // screens whose first-visit guide hint is done
})

export const sessions = pgTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(), // sha256 of the cookie; the raw token is never stored
    userId: owner(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    ip: text(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_id').on(t.userId)],
)

// Insert-only audit trail. user_id becomes NULL if the user is deleted, so history survives.
export const authEvents = pgTable(
  'auth_events',
  {
    id: id(),
    event: text().notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text(),
    reason: text(), // login_failed only: cancelled | state | exchange | token | not_configured
    ip: text(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [check('event_kind', sql`${t.event} IN ('signup', 'login', 'login_failed', 'logout')`), index('auth_events_created_at').on(t.createdAt)],
)

export const consents = pgTable('consents', {
  id: id(),
  userId: owner(),
  kind: text().notNull(), // privacy | llm_processing | indeks_rider
  version: text().notNull(),
  granted: boolean().notNull(),
  createdAt: createdAt(),
})

export const userPlatforms = pgTable('user_platforms', { id: id(), userId: owner(), platform: text().notNull() }, (t) => [unique().on(t.userId, t.platform)])

// One platform's figures for one week. net = gross - commission + incentives + tips.
export const earnings = pgTable(
  'earnings',
  {
    id: id(),
    userId: owner(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    platform: text().notNull(),
    grossSen: integer('gross_sen').notNull(),
    commissionSen: integer('commission_sen').notNull().default(0),
    incentivesSen: integer('incentives_sen').notNull().default(0),
    tipsSen: integer('tips_sen').notNull().default(0), // includes cash orders
    trips: integer(),
    hoursOnline: doublePrecision('hours_online'),
    source: text().notNull().default('manual'), // snap | manual | history
    verification: text().notNull().default('self'), // self | checked | verified
    extractionConfidence: text('extraction_confidence'),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.weekStart, t.platform), index('earnings_user_week').on(t.userId, t.weekStart)],
)

export const expenses = pgTable('expenses', {
  id: id(),
  userId: owner(),
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  amountSen: integer('amount_sen').notNull(),
  category: text().notNull(),
  note: text(),
  input: text().notNull().default('text'), // text | voice | form
  parseTier: text('parse_tier'), // rules | classifier | llm | manual
  createdAt: createdAt(),
})

export const bills = pgTable('bills', {
  id: id(),
  userId: owner(),
  name: text().notNull(),
  amountSen: integer('amount_sen').notNull(),
  frequency: text().notNull(), // weekly | monthly | yearly | once
  dueDay: integer('due_day'), // weekly: 0-6; monthly: 1-31
  dueDate: date('due_date', { mode: 'string' }), // yearly (month/day) | once
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
})

// A virtual allocation inside the rider's one real savings pocket; balance moves only on confirmed transfers.
export const pots = pgTable(
  'pots',
  {
    id: id(),
    userId: owner(),
    kind: text().notNull(), // penampan | cuti | kecemasan | motor | raya | isaraan | perkeso, or c-<id> for the rider's own
    name: text(), // the rider's own pots only; built-ins are named by i18n
    icon: text(), // the rider's own pots only: one of CUSTOM_ICONS
    active: boolean().notNull().default(true), // false = not added yet (built-ins) or closed (kept as history)
    targetSen: integer('target_sen').notNull().default(0),
    balanceSen: integer('balance_sen').notNull().default(0),
    weeklySen: integer('weekly_sen').notNull().default(0), // set aside every week; the engine counts it as an outflow
  },
  (t) => [unique().on(t.userId, t.kind)],
)

export const salaryRuns = pgTable(
  'salary_runs',
  {
    id: id(),
    userId: owner(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    salarySen: integer('salary_sen').notNull(),
    pSafe: doublePrecision('p_safe').notNull(),
    risk: text().notNull(), // selamat | berhati | berisiko
    bufferStartSen: integer('buffer_start_sen').notNull(),
    result: jsonb().$type<EngineResult>().notNull(),
    modelVersion: text('model_version').notNull(),
    seed: text().notNull(), // a 64-bit seed, kept as text so it survives JSON
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.weekStart)],
)

export const transfers = pgTable(
  'transfers',
  {
    id: id(),
    userId: owner(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    direction: text().notNull(), // in | out
    amountSen: integer('amount_sen').notNull(),
    allocation: jsonb().$type<Record<string, number>>().notNull(), // pot kind -> sen, for the full amount
    status: text().notNull().default('pending'), // pending | confirmed | partial | skipped
    confirmedAmountSen: integer('confirmed_amount_sen'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    verification: text().notNull().default('self'), // self | checked (statement cross-check)
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.weekStart)],
)

export const leavePlans = pgTable('leave_plans', {
  id: id(),
  userId: owner(),
  kind: text().notNull(), // planned | sick
  label: text(),
  startWeek: date('start_week', { mode: 'string' }).notNull(),
  weeks: integer().notNull(),
  days: integer(), // sick: days off that week (1-6); planned by the day: the days picked
  startDate: date('start_date', { mode: 'string' }), // planned by the day (null = whole weeks from start_week)
  endDate: date('end_date', { mode: 'string' }),
  setAsideWeekSen: integer('set_aside_week_sen').notNull().default(0),
  status: text().notNull().default('planned'), // planned | cancelled
  createdAt: createdAt(),
})

// Money paid into a scheme (i-Saraan Plus) and the government match it earned.
export const contributions = pgTable('contributions', {
  id: id(),
  userId: owner(),
  kind: text().notNull(),
  amountSen: integer('amount_sen').notNull(),
  matchSen: integer('match_sen').notNull(),
  year: integer().notNull(),
  createdAt: createdAt(),
})

export const checkins = pgTable(
  'checkins',
  {
    id: id(),
    userId: owner(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    answer: text().notNull(), // ya | hampir | tak_cukup
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.weekStart)],
)

// Manual freezes only (2 a quarter); leave and sick weeks freeze automatically from leave_plans.
export const streakFreezes = pgTable(
  'streak_freezes',
  { id: id(), userId: owner(), weekStart: date('week_start', { mode: 'string' }).notNull(), createdAt: createdAt() },
  (t) => [unique().on(t.userId, t.weekStart)],
)

export const badges = pgTable('badges', { id: id(), userId: owner(), kind: text().notNull(), createdAt: createdAt() }, (t) => [unique().on(t.userId, t.kind)])

export const tanyaMessages = pgTable(
  'tanya_messages',
  {
    id: id(),
    userId: owner(),
    role: text().notNull(), // user | assistant
    content: text().notNull(),
    tools: jsonb().$type<string[]>(),
    risk: text(),
    guardTriggered: boolean('guard_triggered').notNull().default(false),
    createdAt: createdAt(), // 90-day retention
  },
  (t) => [index('tanya_user_time').on(t.userId, t.createdAt)],
)

// A verify code printed on a Loan pack or Tax year PDF. The officer types it (or scans the QR) to see the figures as
// they were when the PDF was made, so an edited PDF shows up. Stored hashed, expiring and revocable.
export const docCodes = pgTable('doc_codes', {
  id: id(),
  userId: owner(),
  codeHash: text('code_hash').notNull().unique(),
  hint: text().notNull(), // the last 4 characters, so the rider can tell codes apart
  kind: text().notNull(), // loan | tax
  label: text().notNull(), // "3" / "6" / "12" months, or the tax year
  lang: text().notNull().default('ms'),
  snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  openedCount: integer('opened_count').notNull().default(0),
  createdAt: createdAt(),
})

export const llmUsage = pgTable(
  'llm_usage',
  {
    id: id(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    route: text().notNull(),
    model: text().notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    // Which saved AI connection served the call (null: before connections existed, or since deleted)
    connectionId: integer('connection_id').references(() => aiConnections.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('llm_usage_user_route').on(t.userId, t.route, t.createdAt), index('llm_usage_connection').on(t.connectionId, t.createdAt)],
)

// AI providers the admins manage in /admin/ai: an OpenAI-compatible address and its key. The key is stored encrypted
// (src/llm/keys.ts, AES-256-GCM with AI_KEYS_MASTER_KEY) and never sent back; only its last 4 characters are.
export const aiConnections = pgTable('ai_connections', {
  id: id(),
  name: text().notNull(),
  baseUrl: text('base_url').notNull(),
  keyEnc: text('key_enc').notNull(),
  keyLast4: text('key_last4').notNull(),
  // Shown on the privacy page for every connection a job uses (PDPA: who processes the data, and where)
  providerName: text('provider_name').notNull(),
  regionNote: text('region_note').notNull().default(''),
  // ok | cooling (rate or quota limit: skipped until coolingUntil) | failing (key refused: skipped until edited or re-tested)
  status: text().notNull().default('ok'),
  coolingUntil: timestamp('cooling_until', { withTimezone: true }),
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Each AI job's ordered fallback list: try position 0, and on a key or limit failure the next one.
export const aiSteps = pgTable(
  'ai_steps',
  {
    id: id(),
    job: text().notNull(), // snap | tanya | lender | bm | reco
    position: integer().notNull(),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => aiConnections.id, { onDelete: 'cascade' }),
    model: text().notNull(),
    reasoning: text(), // reasoning_effort to send; null = the provider's default
  },
  (t) => [unique('ai_steps_job_position').on(t.job, t.position)],
)

// Who changed which AI setting, and when. Never holds a key.
export const aiAudit = pgTable('ai_audit', {
  id: id(),
  actorEmail: text('actor_email').notNull(),
  action: text().notNull(),
  detail: text().notNull(),
  createdAt: createdAt(),
})

// Web Push subscriptions for the payday reminder, one per device the rider allowed notifications on.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: owner(),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_subscriptions_user_id').on(t.userId)],
)

// Impact analytics in our own DB. No third-party trackers.
export const events = pgTable('events', {
  id: id(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  props: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
})

// Indeks Rider: written only with consent, and deliberately without a user_id.
export const indexContributions = pgTable('index_contributions', {
  id: id(),
  city: text().notNull(),
  platform: text().notNull(),
  month: text().notNull(), // YYYY-MM
  rateSenPerHour: integer('rate_sen_per_hour').notNull(),
  createdAt: createdAt(),
})

/** What the ML service's /solve returns, stored as-is on each salary run. */
export type EngineResult = {
  salarySen: number
  pSafe: number
  risk: 'selamat' | 'berhati' | 'berisiko'
  transferSen: number
  fromCutiSen: number
  billsThisWeekSen: number
  reservesThisWeekSen: number
  band: { low: number; mid: number; high: number }
  bufferLowSen: number
  buildUp: { targetSen: number; bufferSen: number; per100Sen: number } | null
  jurang: { essentialsSen: number; gapSen: number } | null
  coldStart: boolean
  weeksUsed: number
  ownResiduals: boolean
  billsNextWeek: string[]
  billsSoonSen: number
  setAsideSoonSen: number
  factors: { key: string; deltaSen?: number; names?: string[] }[]
  plannedHours: number
  modelVersion: string
  salaryDeltaSen?: number | null
}
