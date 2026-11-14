import { timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express, { type RequestHandler } from 'express'
import { sql } from 'drizzle-orm'
import { db } from './db/index.ts'
import { env, googleConfigured } from './env.ts'
import { llmConfigured } from './llm/client.ts'
import { providersInUse } from './llm/keys.ts'
import { ApiError, errorHandler } from './errors.ts'
import { requestLog } from './log.ts'
import { accountRouter } from './routes/account.ts'
import { adminRouter } from './routes/admin.ts'
import { aiAdminRouter } from './routes/aiAdmin.ts'
import { advisorRouter } from './routes/advisor.ts'
import { authRouter } from './routes/auth.ts'
import { benefitsRouter } from './routes/benefits.ts'
import { expensesRouter } from './routes/expenses.ts'
import { homeRouter } from './routes/home.ts'
import { profileRouter } from './routes/profile.ts'
import { pushRouter } from './routes/push.ts'
import { recordsRouter } from './routes/records.ts'
import { snapRouter } from './routes/snap.ts'
import { weeksRouter } from './routes/weeks.ts'

const DIST = fileURLToPath(new URL('../../../frontend/dist', import.meta.url)) // served only by `pnpm preview:prod`; in production S3 + CloudFront serve the app
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Security headers. Allows Google profile pictures, inline styles, and Google's sign-in script for One Tap.
const GSI = 'https://accounts.google.com/gsi/'
const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    'Content-Security-Policy':
      `default-src 'self'; img-src 'self' data: blob: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline' ${GSI}style; script-src 'self' ${GSI}client; connect-src 'self' ${GSI}; frame-src ${GSI}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(env.COOKIE_SECURE ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  })
  next()
}

// CSRF defence on top of SameSite=Lax: browsers send Origin on unsafe requests, so a foreign one is refused.
const sameOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin')
  if (UNSAFE.has(req.method) && origin && origin !== new URL(env.APP_URL).origin) throw new ApiError(403, 'bad_origin', 'Permintaan ditolak.', 'Request refused.')
  next()
}

// On AWS only CloudFront knows ORIGIN_VERIFY; anything else reaching /api or /o went around it. The load balancer's
// health check hits the container directly, so /api/health stays open.
const viaCloudFront: RequestHandler = (req, _res, next) => {
  if (!env.ORIGIN_VERIFY || req.path === '/api/health' || !/^\/(api|o)\//.test(req.path)) return next()
  const got = Buffer.from(req.get('x-origin-verify') ?? '')
  const want = Buffer.from(env.ORIGIN_VERIFY)
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError(403, 'forbidden', 'Permintaan ditolak.', 'Request refused.')
  next()
}

// Simple for now: counted in memory per IP. Move it to the database if we run more than one API server.
export function rateLimit(perMinute: number): RequestHandler {
  const buckets = new Map<string, { tokens: number; at: number }>()
  return (req, _res, next) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()
    const b = buckets.get(key) ?? { tokens: perMinute, at: now }
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute)
    b.at = now
    if (b.tokens < 1) throw new ApiError(429, 'rate_limited', 'Terlalu banyak cubaan. Tunggu sebentar.', 'Too many attempts. Wait a moment.')
    b.tokens -= 1
    buckets.set(key, b)
    next()
  }
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', env.TRUST_PROXY) // proxy hops in front (TRUST_PROXY), so req.ip is the real client
  app.use(requestLog)
  app.use(viaCloudFront)
  app.use(securityHeaders)
  app.use(express.json({ limit: '100kb' }))
  app.use(sameOrigin)

  // ?db=1 also runs one query: the keep-alive workflow uses it so Supabase never pauses for inactivity
  app.get('/api/health', async (req, res) => {
    if (req.query.db !== undefined) await db.execute(sql`select 1`)
    res.json({ ok: true, version: env.GIT_SHA })
  })
  // Public facts the privacy page shows: who processes screenshots and chat, and where. Every provider a job can
  // fall back to is named, since any of them may get the data (set per connection in /admin/ai).
  app.get('/api/meta', (_req, res) => {
    const used = providersInUse()
    const names = [...new Set(used.map((c) => c.providerName))]
    const notes = [...new Set(used.map((c) => c.regionNote).filter(Boolean))]
    res.json({ llmEnabled: llmConfigured(), llmProvider: names.join(', ') || null, llmRegion: notes.join(' ') || null, noticeVersion: '2026-10', googleEnabled: googleConfigured(), privacyContact: env.PRIVACY_CONTACT_EMAIL || null })
  })
  app.use('/api/auth', rateLimit(env.AUTH_RATE_PER_MIN), authRouter)
  app.use('/api/admin/ai', rateLimit(60), aiAdminRouter)
  app.use('/api', profileRouter, weeksRouter, homeRouter, snapRouter, advisorRouter, benefitsRouter, expensesRouter, pushRouter, adminRouter, accountRouter)
  app.use('/o', rateLimit(30)) // verify codes are public: slow down guessing
  app.use(recordsRouter)
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'not_found', 'Tidak dijumpai.', 'Not found.')))

  // One service serves the API and the PWA: same origin, first-party cookies, no CORS.
  if (existsSync(DIST)) {
    app.use(express.static(DIST, { index: false, maxAge: '1h' }))
    app.get(/^\/(?!api\/|o\/).*/, (_req, res) => res.sendFile(`${DIST}/index.html`))
  }
  app.use(errorHandler)
  return app
}
