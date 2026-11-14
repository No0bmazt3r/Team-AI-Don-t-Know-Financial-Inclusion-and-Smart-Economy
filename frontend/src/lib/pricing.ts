// How the plan prices were set: what one rider can cost us at most each month, and what's left of the price.
// Every input is dated and sourced here, so the pricing page shows a calculation, not a claim.

export const PRICING_BASIS = {
  checked: '2026-11-14',
  usdToMyr: 4.5, // same rate as backend/api/data/llm_prices.json
  // Gemini 3.5 Flash-Lite, USD per million tokens (published rate; recheck Google's pricing page before launch)
  model: 'Gemini 3.5 Flash-Lite',
  inputUsdPerM: 0.3,
  outputUsdPerM: 2.5,
  // Tokens per action. Odah and Snap are measured from llm_usage on the team's test runs (Odah: 16 calls averaging
  // 1,210 in / 24 out; a question takes ~2.5 calls with its tool round). Snap's output and the trust check are estimates.
  tokens: {
    question: { in: 3_025, out: 60 },
    snap: { in: 4_800, out: 200 },
    check: { in: 2_000, out: 300 }, // two short calls: message signs + lender reading
  },
  hostingMyrPerMonth: 360, // ≈ USD 80 on AWS Singapore (infra/README.md → Cost)
  ridersSharingHosting: 1_000, // the first-year goal; the share halves at 2,000
  paymentFeeRate: 0.012, // DuitNow QR via HitPay's published 1.2%; cards cost more (3% + RM1 on Stripe)
}

export type PlanId = 'basic' | 'pro' | 'ultra'
// Monthly AI allowances. A rider snaps each platform once a week, so 8 Snaps covers two platforms.
export const LIMITS: Record<PlanId, { snaps: number; questions: number; checks: number }> = {
  basic: { snaps: 8, questions: 30, checks: 0 },
  pro: { snaps: 40, questions: 150, checks: 30 },
  ultra: { snaps: 100, questions: 400, checks: 60 },
}
export const PRICE_MYR: Record<PlanId, number> = { basic: 0, pro: 4.9, ultra: 9.9 }
export const YEARLY_MYR: Record<PlanId, number> = { basic: 0, pro: 49, ultra: 99 } // two months free
const SUPPORT_MYR: Record<PlanId, number> = { basic: 0, pro: 0.3, ultra: 1 } // email vs replies within 24h, by a person

const b = PRICING_BASIS
/** RM for one action on the model above. */
export const costOf = (t: { in: number; out: number }) => ((t.in * b.inputUsdPerM + t.out * b.outputUsdPerM) / 1e6) * b.usdToMyr

/** The worst month for one rider on a plan: every AI allowance used up. */
export function breakdown(plan: PlanId) {
  const l = LIMITS[plan]
  const ai = l.snaps * costOf(b.tokens.snap) + l.questions * costOf(b.tokens.question) + l.checks * costOf(b.tokens.check)
  const servers = b.hostingMyrPerMonth / b.ridersSharingHosting
  const payment = PRICE_MYR[plan] * b.paymentFeeRate
  const support = SUPPORT_MYR[plan]
  const cost = ai + servers + payment + support
  return { price: PRICE_MYR[plan], ai, servers, payment, support, cost, left: PRICE_MYR[plan] - cost }
}

/** Paying riders needed to cover the servers on their own, at the worst-case margin. */
export const toCoverServers = (plan: Exclude<PlanId, 'basic'>) => Math.ceil(b.hostingMyrPerMonth / breakdown(plan).left)
