import { expect, test } from 'vitest'
import { breakdown, costOf, PRICING_BASIS, toCoverServers } from './pricing'

test('one Odah question costs under one sen, one Snap about one sen', () => {
  expect(costOf(PRICING_BASIS.tokens.question)).toBeCloseTo(0.0048, 4)
  expect(costOf(PRICING_BASIS.tokens.snap)).toBeCloseTo(0.0087, 4)
})

test('every paid plan keeps a margin even when a rider uses every AI allowance', () => {
  for (const plan of ['pro', 'ultra'] as const) {
    const x = breakdown(plan)
    expect(x.ai + x.servers + x.payment + x.support).toBeCloseTo(x.cost, 9)
    expect(x.left / x.price).toBeGreaterThan(0.4)
  }
  expect(breakdown('basic').left).toBeLessThan(0) // the free plan is paid for by the others
  expect(toCoverServers('pro')).toBeGreaterThan(50)
})
