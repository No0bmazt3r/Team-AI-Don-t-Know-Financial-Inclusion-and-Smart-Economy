import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
import { LangToggle } from '../components/LangToggle'
import { Logo } from '../components/Logo'
import { useI18n, type Key } from '../i18n/t'
import { meQuery } from '../lib/api'
import { breakdown, costOf, LIMITS, type PlanId, PRICE_MYR, PRICING_BASIS, toCoverServers, YEARLY_MYR } from '../lib/pricing'

export const Route = createFileRoute('/pricing')({ component: Pricing })

type Plan = { id: PlanId; features: Key[]; popular?: boolean }

// What each plan lists. The AI allowances and prices come from lib/pricing.ts, where the cost behind them is worked
// out. There is no billing yet, so every feature stays open to every rider.
const PLANS: Plan[] = [
  { id: 'basic', features: ['pricing.f.salary', 'pricing.f.pots', 'pricing.f.leave', 'pricing.f.afford', 'pricing.f.trustRules', 'pricing.f.tax', 'pricing.f.ai', 'pricing.f.supportBasic'] },
  { id: 'pro', popular: true, features: ['pricing.f.loan', 'pricing.f.trustAi', 'pricing.f.suggestions', 'pricing.f.ai', 'pricing.f.supportPro'] },
  { id: 'ultra', features: ['pricing.f.crossCheck', 'pricing.f.ai', 'pricing.f.supportUltra'] },
]
const money = (n: number) => n.toFixed(2)

// Public: anyone can see the plans before signing in. No payment here: Basic starts free, the others are coming.
function Pricing() {
  const { t } = useI18n()
  const router = useRouter()
  const me = useQuery({ ...meQuery, retry: false })
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => router.history.back()} aria-label={t('common.back')} className="pressable -ml-2 grid size-11 place-items-center rounded-full hover:bg-surface-2">
          <ArrowLeft size={22} aria-hidden />
        </button>
        <Logo className="h-8 w-auto" />
        <span className="mr-auto text-lg font-extrabold tracking-tight">Coinvoy</span>
        <LangToggle />
      </div>

      <header className="rise flex flex-col gap-2 text-center">
        <p className="text-sm font-semibold tracking-wide text-brand-text uppercase">{t('pricing.eyebrow')}</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-balance lg:text-5xl">{t('pricing.title')}</h1>
        <p className="mx-auto max-w-xl text-muted text-pretty">{t('pricing.body')}</p>
      </header>

      <ul className="grid items-stretch gap-4 lg:grid-cols-3">
        {PLANS.map((p, i) => (
          <li
            key={p.id}
            style={{ animationDelay: `${80 * i}ms` }}
            className={`rise relative flex flex-col gap-5 rounded-lg bg-surface p-6 ${p.popular ? 'border-2 border-text shadow-[0_12px_32px_rgb(0_0_0/0.10)] lg:-my-2 lg:py-8' : 'border border-line'}`}
          >
            {p.popular && (
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-[0.75rem] font-bold text-on-brand">
                <Sparkles size={12} aria-hidden /> {t('pricing.popular')}
              </span>
            )}
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold">{t(`pricing.${p.id}.name` as Key)}</h2>
              <p className="text-sm text-muted">{t(`pricing.${p.id}.for` as Key)}</p>
            </div>
            <p className="flex items-baseline gap-1">
              <span className="text-lg font-bold">RM</span>
              <span className="text-5xl font-extrabold tracking-tight tabular-nums">{PRICE_MYR[p.id] ? money(PRICE_MYR[p.id]) : '0'}</span>
              <span className="text-sm text-muted">{PRICE_MYR[p.id] ? t('pricing.perMonth') : t('pricing.forever')}</span>
            </p>
            <p className="-mt-3 text-[0.8125rem] text-muted">{PRICE_MYR[p.id] ? t('pricing.yearly', { amount: YEARLY_MYR[p.id], day: money(PRICE_MYR[p.id] / 30) }) : t('pricing.noCard')}</p>
            {p.id === 'basic' ? (
              <Link to={me.data ? '/' : '/login'} className="btn btn-secondary">{t(me.data ? 'pricing.current' : 'pricing.startFree')}</Link>
            ) : (
              <button type="button" disabled className={`btn ${p.popular ? 'btn-primary' : 'btn-secondary'}`}>{t('pricing.soon')}</button>
            )}
            <div className="flex flex-col gap-2.5 border-t border-line pt-5">
              {i > 0 && <p className="text-sm font-semibold">{t(i === 1 ? 'pricing.allBasic' : 'pricing.allPro')}</p>}
              <ul className="flex flex-col gap-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${p.popular ? 'bg-brand text-on-brand' : 'bg-surface-2 text-text'}`}>
                      <Check size={13} strokeWidth={3} aria-hidden />
                    </span>
                    {f === 'pricing.f.ai' ? t(LIMITS[p.id].checks ? 'pricing.f.aiChecks' : 'pricing.f.ai', LIMITS[p.id]) : t(f)}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>

      <HowWePriced />

      <section className="grid gap-3 rounded-lg border border-line bg-surface p-5 text-sm sm:grid-cols-3">
        {(['pricing.note1', 'pricing.note2', 'pricing.note3'] as const).map((k) => (
          <p key={k} className="flex items-start gap-2"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-brand-text" />{t(k)}</p>
        ))}
      </section>
    </main>
  )
}

/** The calculation behind the prices: the most one rider can cost us a month, and what's left. */
function HowWePriced() {
  const { t } = useI18n()
  const b = PRICING_BASIS
  const plans = ['basic', 'pro', 'ultra'] as const
  const rows: { label: Key; get: (x: ReturnType<typeof breakdown>) => number; strong?: boolean }[] = [
    { label: 'pricing.how.ai', get: (x) => x.ai },
    { label: 'pricing.how.servers', get: (x) => x.servers },
    { label: 'pricing.how.payment', get: (x) => x.payment },
    { label: 'pricing.how.support', get: (x) => x.support },
    { label: 'pricing.how.cost', get: (x) => x.cost, strong: true },
    { label: 'pricing.how.left', get: (x) => x.left, strong: true },
  ]
  const data = plans.map((p) => breakdown(p))
  return (
    <section aria-labelledby="how" className="rise flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="how" className="text-xl font-bold">{t('pricing.how.title')}</h2>
        <p className="text-sm text-muted">{t('pricing.how.body')}</p>
      </div>
      {/* Phones: one small card per plan, so nothing scrolls sideways */}
      <div className="flex flex-col gap-3 sm:hidden">
        {plans.map((p, i) => (
          <dl key={p} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-[var(--radius-md)] bg-surface-2 p-4 text-sm tabular-nums">
            <dt className="col-span-2 mb-1 font-bold">{t(`pricing.${p}.name` as Key)} · RM{money(PRICE_MYR[p])}{PRICE_MYR[p] ? ` ${t('pricing.perMonth')}` : ''}</dt>
            {rows.map((r) => {
              const v = r.get(data[i]!)
              return [
                <dt key={`${r.label}-k`} className={r.strong ? 'font-bold' : 'text-muted'}>{t(r.label)}</dt>,
                <dd key={`${r.label}-v`} className={`text-right ${r.strong ? 'font-bold' : ''} ${r.label === 'pricing.how.left' && v < 0 ? 'text-[var(--risky)]' : ''}`}>{v < 0 ? '−' : ''}RM{money(Math.abs(v))}</dd>,
              ]
            })}
          </dl>
        ))}
      </div>
      <div className="hidden sm:block">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 pr-3 font-semibold">{t('pricing.how.perRider')}</th>
              {plans.map((p) => <th key={p} className="py-2 pl-3 text-right font-semibold">{t(`pricing.${p}.name` as Key)} · RM{money(PRICE_MYR[p])}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={`border-b border-line last:border-0 ${r.strong ? 'font-bold' : ''}`}>
                <td className="py-2 pr-3">{t(r.label)}</td>
                {data.map((x, i) => {
                  const v = r.get(x)
                  return <td key={plans[i]} className={`py-2 pl-3 text-right ${r.label === 'pricing.how.left' && v < 0 ? 'text-[var(--risky)]' : ''}`}>{v < 0 ? '−' : ''}RM{money(Math.abs(v))}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-1.5 text-[0.8125rem] text-muted">
        <li>{t('pricing.how.n1', { q: money(costOf(b.tokens.question) * 100), snap: money(costOf(b.tokens.snap) * 100), model: b.model, date: b.checked })}</li>
        <li>{t('pricing.how.n2', { hosting: b.hostingMyrPerMonth, riders: b.ridersSharingHosting.toLocaleString('en-MY') })}</li>
        <li>{t('pricing.how.n3', { pct: b.paymentFeeRate * 100 })}</li>
        <li>{t('pricing.how.n4', { pro: toCoverServers('pro'), ultra: toCoverServers('ultra') })}</li>
      </ul>
    </section>
  )
}
