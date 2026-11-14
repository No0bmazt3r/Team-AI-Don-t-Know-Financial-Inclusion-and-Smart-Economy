import { eq } from 'drizzle-orm'
import webpush from 'web-push'
import { afterEach, expect, test, vi } from 'vitest'
import { db, schema } from '../src/db/index.ts'
import { env } from '../src/env.ts'
import { clock } from '../src/lib/weeks.ts'
import { requestLog } from '../src/log.ts'
import { sendDueReminders } from '../src/services/reminders.ts'
import { agent, demo, onboard, rider } from './helpers.ts'

const SUB = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'BPk', auth: 'xyz' } }
const realNow = clock.now

afterEach(() => {
  clock.now = realNow
  Object.assign(env, { VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' })
  vi.restoreAllMocks()
})

function pushOn() {
  const keys = webpush.generateVAPIDKeys()
  Object.assign(env, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey })
  return vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201, body: '', headers: {} })
}

test('push is off without VAPID keys, and subscribing then says so', async () => {
  const a = await demo()
  expect((await a.get('/api/push')).body).toEqual({ publicKey: null, endpoints: [] })
  expect((await a.post('/api/push').send(SUB)).status).toBe(503)
})

test('the payday reminder goes out once, on the payday morning, in the rider language, and opens Snap', async () => {
  const send = pushOn()
  const a = await demo()
  await onboard(a) // payday 0 = Monday
  expect((await a.post('/api/push').send({ ...SUB, endpoint: 'http://insecure.example' })).status).toBe(422)
  expect((await a.post('/api/push').send(SUB)).status).toBe(204)
  expect((await a.get('/api/push')).body.endpoints).toEqual([SUB.endpoint])

  clock.now = () => new Date('2026-10-19T00:30:00Z') // Monday 08:30 in KL: too early
  expect(await sendDueReminders()).toBe(0)
  clock.now = () => new Date('2026-10-20T02:00:00Z') // Tuesday 10:00: not the payday
  expect(await sendDueReminders()).toBe(0)
  clock.now = () => new Date('2026-10-19T02:00:00Z') // Monday 10:00
  expect(await sendDueReminders()).toBe(1)
  expect(await sendDueReminders()).toBe(0) // once a week
  const payload = JSON.parse(send.mock.calls[0]![1] as string)
  expect(payload).toEqual({ title: 'Hari gaji!', body: expect.any(String), url: '/snap' })

  expect((await a.delete('/api/push').send({ endpoint: SUB.endpoint })).status).toBe(204)
  expect((await a.get('/api/push')).body.endpoints).toEqual([])
})

test('a subscription the browser dropped is deleted', async () => {
  pushOn().mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }))
  const a = await demo()
  await a.post('/api/push').send(SUB)
  expect((await a.post('/api/push/test')).body).toEqual({ sent: 0 })
  expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0)
})

test('the usage view is only for admins and holds no rider data', async () => {
  const a = await rider()
  expect((await a.get('/api/admin/usage')).status).toBe(404)
  const me = (await a.get('/api/auth/me')).body.user
  expect(me.isAdmin).toBe(false)
  await db.update(schema.users).set({ isDemo: false, email: 'Admin@example.com' }).where(eq(schema.users.id, Number(me.id)))
  expect((await a.get('/api/auth/me')).body.user.isAdmin).toBe(true)
  const res = await a.get('/api/admin/usage')
  expect(res.status).toBe(200)
  expect(res.body.riders).toMatchObject({ riders: 1, onboarded: 1, pushReminders: 0 })
  expect(res.body.retention.cohort).toBe(0) // first logged week is today
  expect(res.body.llm).toMatchObject({ days: 30, rows: [], myrPerRider: null })
  expect(res.body.days).toHaveLength(30)
  expect(res.body.days.at(-1)).toMatchObject({ active: 1, calls: {} }) // today: this rider did things
  expect(JSON.stringify(res.body)).not.toContain('example.com')
})

test('request logs are one JSON line with no query string or verify code', async () => {
  const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  Object.assign(env, { LOG_REQUESTS: true })
  try {
    const app = (await import('express')).default()
    app.use(requestLog)
    app.get(/.*/, (_req, res) => void res.send('ok'))
    const { default: request } = await import('supertest')
    await request(app).get('/o/v/SECRETCODE9?x=1')
  } finally {
    Object.assign(env, { LOG_REQUESTS: false })
  }
  const lines = write.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"request"'))
  const verify = JSON.parse(lines.find((l) => l.includes('/o/'))!)
  expect(verify).toMatchObject({ level: 'info', msg: 'request', method: 'GET', path: '/o/v/:code', status: 200, user: null })
  expect(lines.join('')).not.toContain('SECRETCODE9')
})

test('with ORIGIN_VERIFY set, /api and /o need the CloudFront header; the health check stays open', async () => {
  Object.assign(env, { ORIGIN_VERIFY: 'from-cloudfront' })
  try {
    const a = agent()
    expect((await a.get('/api/health')).status).toBe(200)
    expect((await a.get('/api/meta')).status).toBe(403)
    expect((await a.get('/api/meta').set('X-Origin-Verify', 'wrong-value-here')).status).toBe(403)
    expect((await a.get('/o/x')).status).toBe(403)
    expect((await a.get('/api/meta').set('X-Origin-Verify', 'from-cloudfront')).status).toBe(200)
  } finally {
    Object.assign(env, { ORIGIN_VERIFY: '' })
  }
})
