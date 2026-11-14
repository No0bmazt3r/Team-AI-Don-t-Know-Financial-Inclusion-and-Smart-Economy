import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
import { LangToggle } from '../components/LangToggle'
import { Logo } from '../components/Logo'
import { useI18n, type Key } from '../i18n/t'
import { meQuery } from '../lib/api'

export const Route = createFileRoute('/pricing')({ component: Pricing })

type Plan = { id: 'basic' | 'pro' | 'ultra'; price: string; features: Key[]; popular?: boolean }

// What each plan lists. The AI numbers match the daily limits the API enforces for everyone today (LLM_DAILY_*);
// there is no billing yet, so every feature stays open to every rider.
const PLANS: Plan[] = [
  { id: 'basic', price: '0', features: ['pricing.f.salary', 'pricing.f.pots', 'pricing.f.leave', 'pricing.f.afford', 'pricing.f.trustRules', 'pricing.f.tax', 'pricing.f.aiBasic', 'pricing.f.supportBasic'] },
  { id: 'pro', price: '4.90', popular: true, features: ['pricing.f.loan', 'pricing.f.trustAi', 'pricing.f.suggestions', 'pricing.f.aiPro', 'pricing.f.supportPro'] },
  { id: 'ultra', price: '9.90', features: ['pricing.f.crossCheck', 'pricing.f.aiUltra', 'pricing.f.supportUltra'] },
]

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
              <span className="text-5xl font-extrabold tracking-tight tabular-nums">{p.price}</span>
              <span className="text-sm text-muted">{p.price === '0' ? t('pricing.forever') : t('pricing.perMonth')}</span>
            </p>
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
                    {t(f)}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>

      <section className="grid gap-3 rounded-lg border border-line bg-surface p-5 text-sm sm:grid-cols-3">
        {(['pricing.note1', 'pricing.note2', 'pricing.note3'] as const).map((k) => (
          <p key={k} className="flex items-start gap-2"><Check size={16} aria-hidden className="mt-0.5 shrink-0 text-brand-text" />{t(k)}</p>
        ))}
      </section>
    </main>
  )
}
