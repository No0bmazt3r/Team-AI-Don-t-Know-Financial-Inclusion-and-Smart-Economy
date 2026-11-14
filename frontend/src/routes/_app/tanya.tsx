import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { BorderBeam } from 'border-beam'
import { ArrowUp, ArrowUpRight, Calculator, ChevronRight, Lightbulb, ShieldAlert, Sparkles, Trash2 } from 'lucide-react'
import { ThinkingOrb } from 'thinking-orbs'
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Columns } from '../../components/Columns'
import { GuideButton, GuideHint } from '../../components/Guide'
import { RiskBadge } from '../../components/RiskBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Sheet } from '../../components/Sheet'
import { Skeleton } from '../../components/Skeleton'
import { TanyaAvatar } from '../../components/TanyaAvatar'
import { useI18n, type Key } from '../../i18n/t'
import { ApiError, api, celikQuery, errorText, type Message, messagesQuery, metaQuery, prefetch } from '../../lib/api'
import { clearTanyaError, sendTanya, useTanyaChat } from '../../lib/tanyaChat'
import { Tooltip } from '../../components/Tooltip'
import { isDark } from '../../lib/appearance'

export const Route = createFileRoute('/_app/tanya')({ loader: prefetch(metaQuery, messagesQuery, celikQuery), component: Tanya })

const SUGGESTED: Key[] = ['tanya.s1', 'tanya.s2', 'tanya.s3', 'tanya.s4']

// Every number Tanya shows passed the number guard, so they're all from the engine or the rider: bold them.
function withBoldNumbers(text: string): ReactNode {
  return text.split(/(RM\s?[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?\s?%)/g).map((part, i) => (i % 2 ? <b key={i} className="tabular-nums">{part}</b> : <Fragment key={i}>{part}</Fragment>))
}

// Tanya: chat over the engine. Semak Layak and the lender check work without the AI.
function Tanya() {
  const { t, lang } = useI18n()
  const meta = useQuery(metaQuery)
  const history = useQuery(messagesQuery)
  const celik = useQuery(celikQuery)
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const { pending, text: streamed, error, failed } = useTanyaChat()
  const busy = pending !== null
  const [clearing, setClearing] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const panel = useFitToScreen()
  const clear = useMutation({
    mutationFn: () => api('/api/tanya/messages', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData(messagesQuery.queryKey, [])
      clearTanyaError()
      setClearing(false)
    },
  })
  const lastReply = history.data?.findLastIndex((m) => m.role === 'assistant') ?? -1
  const started = (history.data?.length ?? 0) > 0 || pending !== null || failed !== null
  useEffect(() => {
    if (started) end.current?.scrollIntoView({ block: 'end' }) // braces: newer browsers return a Promise, which React would call as cleanup
  }, [history.data?.length, pending, streamed, started])
  // The composer moves from the middle to the bottom on the first message, so keep the cursor in it
  useEffect(() => {
    if (started) input.current?.focus({ preventScroll: true })
  }, [started])
  const send = (m: string) => {
    if (m.trim() && !busy) {
      void sendTanya(m.trim(), lang, queryClient)
      setText('')
    }
  }
  const aiOff = meta.data?.llmEnabled === false || (error instanceof ApiError && error.code === 'llm_unconfigured')
  const composer = (
    // The rainbow beam runs round the box while Tanya works on an answer
    <BorderBeam active={busy && !reducedMotion()} theme={isDark() ? 'dark' : 'light'} borderRadius={9999}>
      <div className="flex items-center gap-2 rounded-full border border-line-strong bg-surface-2 p-1.5 pl-5 shadow-[0_8px_24px_rgb(0_0_0/0.18)] focus-within:border-text">
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t('tanya.placeholder')} aria-label={t('tanya.placeholder')} className="h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
        <Tooltip side="bottom" text={t('tanya.send')}><button type="submit" aria-label={t('tanya.send')} disabled={!text.trim() || busy} className="pressable grid size-10 shrink-0 place-items-center rounded-full bg-brand text-on-brand disabled:bg-line disabled:text-muted">
          <ArrowUp size={20} strokeWidth={2.5} aria-hidden />
        </button></Tooltip>
      </div>
    </BorderBeam>
  )
  const submit = (e: FormEvent) => { e.preventDefault(); send(text) }

  return (
    <>
      <ScreenHeader
        title={t('tanya.title')}
        action={
          <div className="flex gap-1">
            <GuideButton screen="tanya" />
            {(history.data?.length ?? 0) > 0 && (
              <Tooltip side="bottom" text={t('tanya.clear')}><button type="button" onClick={() => setClearing(true)} aria-label={t('tanya.clear')} className="pressable grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
                <Trash2 size={20} aria-hidden />
              </button></Tooltip>
            )}
            {started && (
              <>
              <Tooltip side="bottom" text={t('layak.title')}><Link to="/layak" aria-label={t('layak.title')} className="pressable grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
                <Calculator size={20} aria-hidden />
              </Link></Tooltip>
              <Tooltip side="bottom" text={t('check.title')}><Link to="/semak" aria-label={t('check.title')} className="pressable grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
                <ShieldAlert size={20} aria-hidden />
              </Link></Tooltip>
            </>
            )}
          </div>
        }
      />
      <GuideHint screen="tanya" />

      {/* Desktop: tools and lessons on the side. Phones: above the chat until it starts. */}
      <Columns>
      <div className="col lg:col-start-2 lg:row-start-1">
        <section aria-labelledby="tools" data-tour="tools" className={`flex flex-col gap-2 max-lg:order-1 ${started && !aiOff ? 'max-lg:hidden' : ''}`}>
          <h2 id="tools" className="px-1 text-sm font-semibold text-muted">{t('tanya.tools')}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">
            <ToolRow to="/layak" icon={<Calculator size={20} aria-hidden />} title={t('layak.title')} sub={t('layak.entry')} />
            <ToolRow to="/semak" icon={<ShieldAlert size={20} aria-hidden />} title={t('check.title')} sub={t('check.entry')} />
          </div>
        </section>

      {celik.data && celik.data.length > 0 && (
        <section aria-labelledby="celik" className={`flex flex-col gap-2 max-lg:order-1 ${started ? 'max-lg:hidden' : ''}`}>
          <h2 id="celik" className="flex items-center gap-1.5 px-1 text-sm font-semibold text-muted"><Lightbulb size={16} aria-hidden /> {t('celik.title')}</h2>
          {/* scroll-px keeps snapped cards on the page's left edge instead of flush to the screen */}
          {/* a swipeable row on phones; a stacked list in the desktop side panel */}
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" data-no-swipe>
            {celik.data.map((l) => (
              <article key={l.topic} className="flex w-[78%] max-w-72 shrink-0 snap-start flex-col gap-1 rounded-[var(--radius-md)] border border-line bg-surface p-4 lg:w-auto lg:max-w-none">
                <h3 className="font-semibold leading-snug">{l.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{l.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      </div>

      {/* Before the first message the composer sits in the middle under the suggestions; after it, the composer is pinned
          to the bottom. Desktop: the chat is its own panel that fills the screen height and scrolls by itself. */}
      <div ref={panel} className="col lg:col-start-1 lg:row-start-1 lg:sticky lg:top-6 lg:min-h-[30rem]">
      <section aria-label={t('tanya.chat')} aria-live="polite" className={`flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-2 ${started ? '' : 'lg:justify-center'}`}>
        {aiOff ? (
          <p className="flex items-start gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 text-sm leading-relaxed">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            {t('tanya.aiOff')}
          </p>
        ) : history.isPending ? (
          <>
            <Skeleton className="h-12 w-2/3 self-end" />
            <Skeleton className="h-20 w-5/6" />
          </>
        ) : !started ? (
          <>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <TanyaAvatar size={72} />
              <p className="max-w-md text-lg leading-snug font-medium">{t('tanya.hello')}</p>
            </div>
            <form data-tour="ask" onSubmit={submit}>{composer}</form>
            <h2 className="mt-1 px-1 text-sm font-semibold text-muted">{t('tanya.tryAsking')}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTED.map((k) => (
                <button key={k} type="button" onClick={() => send(t(k))} disabled={busy} className="pressable flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 text-left text-sm font-medium hover:bg-surface-2">
                  {t(k)}
                  <ArrowUpRight size={16} className="shrink-0 text-muted" aria-hidden />
                </button>
              ))}
            </div>
          </>
        ) : null}
        {history.data?.map((m, i) => <Bubble key={m.id ?? i} m={m} avatar={!pending && !failed && m.role === 'assistant' && i === lastReply ? 'idle' : undefined} />)}
        {pending && (
          <>
            <Bubble m={{ role: 'user', content: pending, risk: null, at: '' }} />
            {streamed ? (
              // The reply as it is written; the finished answer replaces it when it is saved
              <Bubble m={{ role: 'assistant', content: streamed, risk: null, at: '' }} avatar="busy" />
            ) : (
              <div className="flex items-end gap-2 self-start">
                <TanyaAvatar size={AVATAR} busy />
                <div role="status" className="flex items-center gap-2.5 rounded-[var(--radius-lg)] rounded-bl-md bg-surface py-2 pr-4 pl-2 text-sm text-muted">
                  <ThinkingOrb state="composing" size={32} aria-hidden />
                  {t('tanya.thinking')}
                </div>
              </div>
            )}
          </>
        )}
        {/* A message that got no answer stays on screen (it isn't saved), with the reason and a way to send it again */}
        {failed && !aiOff && <Bubble m={{ role: 'user', content: failed, risk: null, at: '' }} />}
        {error !== null && !aiOff && (
          <div role="alert" className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 self-end text-sm font-semibold text-[var(--risky)]">
            {errorText(error, lang, t('common.tryAgain'))}
            {failed && <button type="button" className="underline underline-offset-2" onClick={() => { clearTanyaError(); send(failed) }}>{t('common.tryAgainButton')}</button>}
          </div>
        )}
        <p className="mx-auto max-w-sm text-center text-xs leading-relaxed text-muted">
          {t('common.disclaimer')}{' '}
          <Link to="/privacy" className="inline-flex items-center gap-0.5 underline underline-offset-2">{t('tanya.whereData')}<ChevronRight size={12} aria-hidden /></Link>
        </p>
        {/* scroll-margin clears the pinned composer and the bottom nav when scrolling to the newest message */}
        <div ref={end} className="scroll-mb-[calc(11rem+env(safe-area-inset-bottom))] lg:scroll-mb-0" />
      </section>

      {started && !aiOff && (
        <>
          <div aria-hidden className="h-24 lg:hidden" />
          {/* Pinned above the bottom nav on phones; the bottom of the chat panel on desktop */}
          <form
            data-tour="ask"
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 mx-auto w-full max-w-[480px] bg-bg px-4 pt-2 pb-8 lg:static lg:max-w-none lg:px-1 lg:pt-3 lg:pb-1"
            onSubmit={submit}
          >
            {composer}
          </form>
        </>
      )}
      </div>
      </Columns>
      <Sheet open={clearing} onClose={() => setClearing(false)} title={t('tanya.clearTitle')}>
        <p className="text-muted">{t('tanya.clearBody')}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setClearing(false)}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={clear.isPending} onClick={() => clear.mutate()}>
            <Trash2 size={18} aria-hidden /> {t('tanya.clear')}
          </button>
        </div>
        {clear.isError && <p role="alert" className="mt-2 text-sm text-[var(--risky)]">{errorText(clear.error, lang, t('common.tryAgain'))}</p>}
      </Sheet>
    </>
  )
}

/** Desktop: the chat panel runs from where it starts down to the bottom of the screen, whatever sits above it. */
function useFitToScreen() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + scrollY
      el.style.height = matchMedia('(width >= 64rem)').matches ? `calc(100dvh - ${top}px - 2rem)` : ''
    }
    fit()
    // the tips banner closing, or the window resizing, moves the panel
    const ro = new ResizeObserver(fit)
    ro.observe(el.parentElement!.parentElement!)
    addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      removeEventListener('resize', fit)
    }
  }, [])
  return ref
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function ToolRow({ to, icon, title, sub }: { to: '/layak' | '/semak'; icon: ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="pressable flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-[0.8125rem] text-muted">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
    </Link>
  )
}

const AVATAR = 30

// Tanya's replies sit beside its avatar. Only the latest reply (or the one being written) shows it, hopping while
// Tanya works; older replies keep the space so they line up. One live canvas, not one per message.
function Bubble({ m, avatar }: { m: Message; avatar?: 'idle' | 'busy' }) {
  if (m.role === 'user') return <p className="max-w-[85%] self-end whitespace-pre-wrap rounded-[var(--radius-lg)] rounded-br-md bg-brand px-4 py-2.5 text-on-brand">{m.content}</p>
  return (
    <div className="flex max-w-[92%] items-end gap-2 self-start">
      {avatar ? <TanyaAvatar size={AVATAR} busy={avatar === 'busy'} /> : <span aria-hidden className="shrink-0" style={{ width: AVATAR }} />}
      <div className="flex min-w-0 flex-col items-start gap-2 rounded-[var(--radius-lg)] rounded-bl-md bg-surface px-4 py-3 leading-relaxed">
        {m.risk && <RiskBadge risk={m.risk} size="sm" />}
        <p className="whitespace-pre-wrap">{withBoldNumbers(m.content)}</p>
      </div>
    </div>
  )
}
