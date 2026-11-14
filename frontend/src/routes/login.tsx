import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { GoogleIcon } from '../components/GoogleIcon'
import { LangToggle } from '../components/LangToggle'
import { Logo } from '../components/Logo'
import { useI18n, type Key } from '../i18n/t'
import { errorText, meQuery, metaQuery, post } from '../lib/api'
import { useGoogleOneTap } from '../lib/oneTap'
import { introSeen } from '../lib/intro'

// The API sends failed Google sign-ins back here as ?error=<reason>.
const ERRORS: Record<string, Key> = {
  cancelled: 'login.error.cancelled',
  state: 'login.error.state',
  not_configured: 'login.error.notConfigured',
  demo: 'login.error.demo', // from /try when the demo can't start
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === 'string' ? { error: search.error } : {},
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(meQuery).catch(() => null)
    if (user) throw redirect({ to: '/' })
    if (!introSeen()) throw redirect({ to: '/welcome' })
  },
  component: Login,
})

function Login() {
  const { t, lang } = useI18n()
  const { error } = Route.useSearch()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const demo = useMutation({
    mutationFn: (persona: DemoPersona) => post(`/api/auth/demo?persona=${persona}`),
    onSuccess: async () => {
      // Refetch now: the route guard's ensureQueryData would otherwise reuse the cached "signed out" answer.
      await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
      await navigate({ to: '/' })
    },
  })

  // Google One Tap. If it doesn't show, the Google button below still works.
  const meta = useQuery(metaQuery)
  const [oneTapError, setOneTapError] = useState<unknown>(null)
  useGoogleOneTap(
    meta.data?.googleEnabled === true,
    lang,
    async () => {
      await queryClient.fetchQuery({ ...meQuery, staleTime: 0 })
      await navigate({ to: '/' })
    },
    setOneTapError,
  )

  const message = demo.isError
    ? t('login.error.demo')
    : oneTapError
      ? errorText(oneTapError, lang, t('login.error.failed'))
      : error
        ? t(ERRORS[error] ?? 'login.error.failed')
        : ''

  return (
    // Desktop: a dark brand panel on the left, sign-in on the right
    <main className="page-in relative mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:grid lg:max-w-none lg:grid-cols-2 lg:p-0">
      <div className="flex justify-end pt-3 lg:absolute lg:top-4 lg:right-6 lg:pt-0">
        <LangToggle />
      </div>

      <section className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center lg:bg-ink lg:px-12 lg:text-on-ink">
        <Logo className="h-[120px] w-auto lg:h-[clamp(120px,13vw,220px)]" />
        <h1 className="text-[2rem] leading-[2.375rem] font-extrabold tracking-tight lg:text-[clamp(2rem,3.5vw,4rem)] lg:leading-tight">Coinvoy</h1>
        <p className="max-w-sm text-lg leading-[1.625rem] font-medium lg:max-w-[min(36rem,90%)] lg:text-[clamp(1.125rem,1.5vw,1.75rem)] lg:leading-snug">{t('app.tagline')}</p>
        <p className="max-w-sm text-muted lg:max-w-[min(34rem,90%)] lg:text-[clamp(1rem,1.1vw,1.25rem)] lg:text-on-ink-muted">{t('login.pitch')}</p>
      </section>

      <section className="flex flex-col gap-3 lg:mx-auto lg:w-full lg:max-w-[clamp(24rem,26vw,32rem)] lg:justify-center lg:px-4">
        {/* A real navigation, not fetch: the API redirects to Google and back. */}
        <a href="/api/auth/google" className="btn btn-secondary">
          <GoogleIcon />
          {t('login.google')}
        </a>
        <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          {t('login.or')}
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-2">
          <p className="mb-2 text-sm font-semibold">{t('login.chooseDemo')}</p>
          <div className="grid gap-2">
            {DEMO_PERSONAS.map(({ key, label, detail }) => (
              <button key={key} type="button" className="btn btn-ghost justify-between text-left" onClick={() => demo.mutate(key)} disabled={demo.isPending}>
                <span>
                  <span className="block font-semibold">{t(label)}</span>
                  <span className="block text-xs font-normal text-muted">{t(detail)}</span>
                </span>
                <span aria-hidden className="text-muted">→</span>
              </button>
            ))}
          </div>
        </div>
        <p role="alert" className="min-h-5 text-center text-sm font-medium text-[var(--risky)]">
          {message}
        </p>
        <p className="text-center text-[0.8125rem] text-muted">{t('login.footnote')}</p>
        <Link to="/pricing" className="pressable self-center text-[0.8125rem] font-semibold underline underline-offset-4">{t('settings.pricing')}</Link>
      </section>
    </main>
  )
}

type DemoPersona = 'faiz' | 'lina' | 'siti' | 'ravi' | 'mei'

const DEMO_PERSONAS: { key: DemoPersona; label: Key; detail: Key }[] = [
  { key: 'faiz', label: 'login.persona.faiz', detail: 'login.persona.faizDetail' },
  { key: 'lina', label: 'login.persona.lina', detail: 'login.persona.linaDetail' },
  { key: 'siti', label: 'login.persona.siti', detail: 'login.persona.sitiDetail' },
  { key: 'ravi', label: 'login.persona.ravi', detail: 'login.persona.raviDetail' },
  { key: 'mei', label: 'login.persona.mei', detail: 'login.persona.meiDetail' },
]
