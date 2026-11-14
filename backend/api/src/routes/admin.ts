// The team's usage view (/admin): rider counts, retention and AI cost. Only for ADMIN_EMAILS; never shows a rider's data.
import { Router } from 'express'
import { isAdmin, requireUser, userOf } from '../auth.ts'
import { db } from '../db/index.ts'
import { notFound } from '../errors.ts'
import { daily, guideStats, llmUsage, loadPrices, retention, riderCounts } from '../services/usage.ts'

export const adminRouter = Router()

adminRouter.get('/admin/usage', requireUser, async (_req, res) => {
  const user = userOf(res)
  if (!isAdmin(user.email, user.isDemo)) throw notFound() // don't reveal that the page exists
  const prices = loadPrices()
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [llm, riders, kept, guides, days] = await Promise.all([llmUsage(db, since, prices), riderCounts(db), retention(db), guideStats(db), daily(db, 30)])
  const usd = llm.rows.reduce((a, r) => a + (r.usd ?? 0), 0)
  res.json({
    riders,
    retention: kept,
    days, // per day: riders who did anything, and AI calls per job
    guides, // riders who started / finished / skipped each screen's tour
    llm: {
      days: 30,
      rows: llm.rows.map(({ first: _f, last: _l, usd, ...r }) => ({ ...r, myr: usd === null ? null : usd * prices.usdToMyr })),
      riders: llm.riders,
      myrPerRider: llm.riders && prices.checked ? (usd * prices.usdToMyr) / llm.riders : null,
      pricesChecked: prices.checked || null,
    },
  })
})
