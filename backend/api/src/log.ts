// Structured logs: one JSON object per line on stdout/stderr, which CloudWatch Logs (and any log tool) can search by field.
import type { RequestHandler } from 'express'
import { env } from './env.ts'

type Level = 'info' | 'warn' | 'error'

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields }) + '\n'
  ;(level === 'info' ? process.stdout : process.stderr).write(line)
}

export const errorFields = (err: unknown) => (err instanceof Error ? { err: err.message, stack: err.stack } : { err: String(err) })

// The officer link's token is a credential, so it never reaches the logs; query strings are dropped for the same reason.
const safePath = (url: string) => url.split('?')[0]!.replace(/^\/o\/[^/]+/, '/o/:token')

/** method, path, status, ms and the rider's id: no bodies, no emails, no query strings. */
export const requestLog: RequestHandler = (req, res, next) => {
  if (!env.LOG_REQUESTS) return next()
  const start = performance.now()
  res.on('finish', () => {
    log(res.statusCode >= 500 ? 'error' : 'info', 'request', {
      method: req.method,
      path: safePath(req.originalUrl),
      status: res.statusCode,
      ms: Math.round(performance.now() - start),
      user: res.locals.user?.id ?? null,
    })
  })
  next()
}
