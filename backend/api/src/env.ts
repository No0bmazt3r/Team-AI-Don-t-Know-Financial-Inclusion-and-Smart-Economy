import { z } from 'zod'

// Fails fast on a bad environment. One .env at the repo root; real env vars win.
const bool = (fallback: boolean) => z.stringbool().default(fallback)
const schema = z.object({
  PORT: z.coerce.number().default(8000),
  // Empty: the built-in local database. memory:// for tests. postgres://… on a server (on AWS without the password:
  // node-postgres reads PGPASSWORD, which ECS fills from the coinvoy/db secret).
  DATABASE_URL: z.string().default(''),
  // Apply pending migrations at startup, locally and on AWS (one backend task, so no two runs race).
  MIGRATE_ON_START: bool(true),
  // The commit the running build came from, shown by /api/health. The image bakes it in (backend/Dockerfile).
  GIT_SHA: z.string().default('dev'),
  // Set on AWS: CloudFront sends it as X-Origin-Verify, and /api and /o refuse requests without it, so nobody can skip
  // CloudFront by calling the backend's own address. Empty = no check (local, tests).
  ORIGIN_VERIFY: z.string().default(''),
  // Local PGlite only: also accept Postgres connections (DBeaver, psql) on this port while the API runs. 0 = off.
  PGLITE_PORT: z.coerce.number().int().min(0).max(65535).default(5433),
  APP_URL: z.url().default('http://localhost:5173'),
  COOKIE_SECURE: bool(false),
  SESSION_TTL_DAYS: z.coerce.number().positive().default(7),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  DEMO_ENABLED: bool(true),
  AUTH_RATE_PER_MIN: z.coerce.number().default(30), // per IP on /api/auth/*
  LOG_REQUESTS: bool(true), // one JSON line per request (backend/api/src/log.ts)
  // Comma-separated Google emails that can open the usage view (/admin). Empty = nobody.
  ADMIN_EMAILS: z.string().default('').transform((s) => s.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)),
  // Web Push for the payday reminder. Generate once: pnpm --filter coinvoy-api exec web-push generate-vapid-keys
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@coinvoy.invalid'),
  // The Python ML service (engine, BM classifier, Penyata renderer)
  // A bare host:port gets http:// added.
  ML_URL: z.preprocess((v) => (typeof v === 'string' && v && !/^https?:\/\//.test(v) ? `http://${v}` : v), z.url().default('http://127.0.0.1:8001')),
  ML_TOKEN: z.string().default(''),
  // How many proxies sit in front of the API: 1 for the Vite dev server, 2 on AWS (CloudFront, then the load balancer)
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  // AI providers, keys and models are managed in the app (/admin/ai) and stored encrypted with this key:
  // a base64 32-byte value (openssl rand -base64 32). Empty = keys can't be stored or read, so AI is off.
  // Changing it makes stored keys unreadable (they must be re-entered in /admin/ai).
  AI_KEYS_MASTER_KEY: z.string().default(''),
  LLM_TIMEOUT_S: z.coerce.number().default(60),
  LLM_DAILY_SNAP: z.coerce.number().default(15),
  LLM_DAILY_TANYA: z.coerce.number().default(20),
  LLM_DAILY_LENDER: z.coerce.number().default(5),
  LLM_DAILY_BM: z.coerce.number().default(30),
  LLM_DAILY_RECO: z.coerce.number().default(10),
  LLM_MONTHLY_CALL_CAP: z.coerce.number().default(20_000),
  // Shown on the privacy page as the contact for data questions (PDPA asks for one)
  PRIVACY_CONTACT_EMAIL: z.string().default(''),
  DEMO_LLM_CACHE: bool(false),
  BM_CLASSIFIER_THRESHOLD: z.coerce.number().default(0.7),
  // Contributions. VERIFY each against the official source before the pitch.
  ISARAAN_MATCH_RATE: z.coerce.number().default(0.2),
  ISARAAN_MATCH_CAP_SEN: z.coerce.number().default(50_000),
  PERKESO_RATE: z.coerce.number().default(0.0125),
  PERKESO_DEDUCTED_AT_SOURCE: bool(true),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment (see .env.example):\n' + z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export const googleConfigured = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
export const pushConfigured = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
