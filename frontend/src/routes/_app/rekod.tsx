import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Mic, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BarChart, HBars, Legend } from '../../components/Chart'
import { InfoTip } from '../../components/InfoTip'
import { ErrorState } from '../../components/ErrorState'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Sheet } from '../../components/Sheet'
import { Skeleton } from '../../components/Skeleton'
import { Select } from '../../components/Select'
import { Documents } from '../../components/Documents'
import { StatementCheck } from '../../components/StatementCheck'
import { useI18n, type Key } from '../../i18n/t'
import { api, errorText, expensesQuery, penyataQuery, prefetch, MARK, type Platform, type Week, weeksQuery } from '../../lib/api'
import { shortDate, thisWeekStart, weekLabel } from '../../lib/dates'
import { axisRM, formatRM } from '../../lib/money'
import { Tooltip } from '../../components/Tooltip'

export const Route = createFileRoute('/_app/rekod')({ loader: prefetch(weeksQuery, penyataQuery), component: Rekod })

type Parsed = { amountSen: number | null; category: string | null; tier: string; confidence: number }
type Payslip = {
  weekStart: string
  platforms: { platform: string; grossSen: number; commissionSen: number; incentivesSen: number; tipsSen: number; netSen: number; verification: string }[]
  netSen: number
  costs: Record<string, number>
  salarySen: number | null
  perkeso: { deductedAtSource: boolean; estimateSen: number }
  transfer: { direction: string; amountSen: number; status: string } | null
}
const CATEGORIES = ['minyak', 'servis', 'ansuran', 'makan', 'telefon', 'parking', 'tol', 'sewa', 'keluarga', 'motor_tahunan', 'lain']

// Rekod: weeks, payslips, the Loan pack and Tax year PDFs, and costs. Desktop: weeks in their own column.
function Rekod() {
  const { t, lang } = useI18n()
  const weeks = useQuery(weeksQuery)
  const [open, setOpen] = useState<Week | null>(null)
  return (
    <>
      <ScreenHeader title={t('rekod.title')} back />
      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <div className="col">
          <Costs />
          <Documents />
          <StatementCheck />
        </div>
        <div className="col lg:sticky lg:top-6">
          {/* Desktop: the weeks scroll on their own (no scrollbar) and the page stays put */}
          <section aria-labelledby="weeks" className="flex flex-col gap-2 lg:max-h-[calc(100dvh-7.5rem)]">
            <h2 id="weeks" className="px-1 text-sm font-semibold text-muted">{t('rekod.weeks')}</h2>
            {weeks.isPending ? <Skeleton className="h-40" /> : weeks.isError ? <ErrorState error={weeks.error} onRetry={() => weeks.refetch()} /> : weeks.data.length === 0 ? (
              <p className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">{t('rekod.noWeeks')}</p>
            ) : (
              <>
              <PlatformChart weeks={weeks.data} onOpen={setOpen} />
              <ul className="no-scrollbar flex min-h-0 shrink flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface lg:overflow-y-auto lg:overscroll-contain">
                {weeks.data.map((w) => (
                  <li key={w.weekStart}>
                    <button type="button" onClick={() => setOpen(w)} className="pressable flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{weekLabel(w.weekStart, lang)}</span>
                        <span className="block text-[0.8125rem] text-muted">
                          {w.platforms.map((p) => t(`platform.${p.platform}` as Key)).join(' · ')} · {t(w.verification === 'checked' ? 'source.checked' : 'source.self')}
                        </span>
                      </span>
                      <b className="tabular-nums">{formatRM(w.netSen)}</b>
                    </button>
                  </li>
                ))}
              </ul>
              </>
            )}
          </section>
        </div>
      </div>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? t('slip.title', { week: weekLabel(open.weekStart, lang) }) : ''}>
        {open && <PayslipView week={open} onDone={() => setOpen(null)} />}
      </Sheet>
    </>
  )
}

// Stacked from the bottom in this order. The colours were checked for colour blindness in this order.
const STACK: Platform[] = ['grab', 'shopeefood', 'foodpanda', 'lalamove', 'other']

// Each week's earnings split by app, the last 12 weeks. Tapping a week opens its payslip. Only with 2+ weeks.
function PlatformChart({ weeks, onOpen }: { weeks: Week[]; onOpen: (w: Week) => void }) {
  const { t, lang } = useI18n()
  const last = weeks.slice(0, 12).reverse()
  if (last.length < 2) return null
  const used = STACK.filter((p) => last.some((w) => w.platforms.some((x) => x.platform === p)))
  const color = (p: Platform) => `var(--c-${p})`
  const name = (p: Platform) => t(`platform.${p}` as Key)
  const of = (w: Week, p: Platform) => w.platforms.filter((x) => x.platform === p).reduce((a, x) => a + x.netSen, 0)
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div>
        <h3 className="font-semibold">{t('chart.platformsTitle')}</h3>
        <p className="text-sm text-muted">{t('chart.platformsHint')}</p>
      </div>
      {used.length > 1 && <Legend items={used.map((p) => ({ color: color(p), label: name(p), icon: MARK[p].src }))} />}
      <BarChart
        cols={last.map((w) => ({ label: shortDate(w.weekStart, lang), parts: used.map((p) => ({ color: color(p), value: of(w, p) })) }))}
        format={axisRM}
        onSelect={(i) => onOpen(last[i]!)}
        summary={t('chart.platformsSummary', { n: last.length })}
        tips={last.map((w) => ({
          title: `${weekLabel(w.weekStart, lang)} · ${formatRM(w.netSen)}`,
          rows: [...used].reverse().filter((p) => of(w, p)).map((p) => ({ color: color(p), label: name(p), value: formatRM(of(w, p)) })),
        }))}
      />
    </div>
  )
}

function PayslipView({ week, onDone }: { week: Week; onDone: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const slip = useQuery({ queryKey: ['payslip', week.weekStart], queryFn: () => api<Payslip>(`/api/payslip/${week.weekStart}`) })
  const remove = useMutation({
    mutationFn: async () => {
      for (const p of week.platforms) await api(`/api/earnings/${p.id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      onDone()
      void queryClient.invalidateQueries()
    },
  })
  if (!slip.data) return <Skeleton className="h-48" />
  const s = slip.data
  const row = (label: string, sen: number, strong = false, info?: string) => (
    <div className="flex justify-between gap-3 py-1 text-sm"><span className="flex items-center gap-1 text-muted">{label}{info && <InfoTip term={label} text={info} />}</span><span className={`tabular-nums ${strong ? 'font-bold' : ''}`}>{formatRM(sen)}</span></div>
  )
  return (
    <div className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto">
      {s.platforms.map((p) => (
        <div key={p.platform} className="rounded-[var(--radius-sm)] bg-surface-2 p-3">
          <p className="font-semibold">{t(`platform.${p.platform}` as Key)} <span className="text-[0.8125rem] font-normal text-muted">· {t(p.verification === 'checked' ? 'source.checked' : 'source.self')}</span></p>
          {row(t('snap.gross'), p.grossSen, false, t('term.gross'))}
          {p.commissionSen > 0 && row(t('snap.commission'), -p.commissionSen, false, t('term.commission'))}
          {p.incentivesSen > 0 && row(t('snap.incentives'), p.incentivesSen, false, t('term.incentives'))}
          {p.tipsSen > 0 && row(t('snap.tips'), p.tipsSen, false, t('term.tips'))}
        </div>
      ))}
      {row(t('slip.net'), s.netSen, true, t('term.net'))}
      {Object.entries(s.costs).map(([c, sen]) => <div key={c}>{row(t(`cost.${c}` as Key), -sen)}</div>)}
      {s.salarySen !== null && row(t('slip.salary'), s.salarySen, true)}
      {s.transfer && row(t(s.transfer.direction === 'in' ? 'slip.toPocket' : 'slip.fromPocket'), s.transfer.amountSen)}
      <p className="text-[0.8125rem] text-muted">{s.perkeso.deductedAtSource ? t('slip.perkesoDeducted', { amount: formatRM(s.perkeso.estimateSen) }) : t('slip.perkesoReserve')}</p>
      <button type="button" className="btn btn-secondary text-[var(--risky)]" disabled={remove.isPending} onClick={() => remove.mutate()}>
        <Trash2 size={18} aria-hidden /> {t('slip.delete')}
      </button>
    </div>
  )
}

// BM cost quick entry: "minyak 40" → a parsed chip → save. Voice where the browser supports it.
function Costs() {
  const { t, lang } = useI18n()
  const week = thisWeekStart()
  const list = useQuery(expensesQuery(week))
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [category, setCategory] = useState('lain')
  const parse = useMutation({
    mutationFn: (q: string) => api<Parsed>('/api/expenses/parse', { body: { text: q } }),
    onSuccess: (p) => {
      setParsed(p)
      setCategory(p.category ?? 'lain')
    },
  })
  const save = useMutation({
    mutationFn: () => api('/api/expenses', { body: { amountSen: parsed!.amountSen, category, note: text, parseTier: parsed!.tier === 'none' ? 'manual' : parsed!.tier, input: 'text' } }),
    onSuccess: () => {
      setText('')
      setParsed(null)
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
  const remove = useMutation({ mutationFn: (id: number) => api(`/api/expenses/${id}`, { method: 'DELETE' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }) })
  const Speech = (window as unknown as { SpeechRecognition?: new () => SpeechLike; webkitSpeechRecognition?: new () => SpeechLike }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechLike }).webkitSpeechRecognition
  const listen = () => {
    if (!Speech) return
    const rec = new Speech()
    rec.lang = 'ms-MY'
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? ''
      setText(said)
      if (said) parse.mutate(said)
    }
    rec.start()
  }
  const total = (list.data ?? []).reduce((a, x) => a + x.amountSen, 0)
  return (
    <section aria-labelledby="costs" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="costs" className="font-semibold">{t('cost.title')}</h2>
        <span className="text-sm text-muted tabular-nums">{formatRM(total)}</span>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) parse.mutate(text.trim()) }}>
        <input value={text} onChange={(e) => { setText(e.target.value); setParsed(null) }} maxLength={120} placeholder={t('cost.placeholder')} aria-label={t('cost.placeholder')} className="h-12 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3" />
        {Speech && <Tooltip side="bottom" text={t('cost.voice')}><button type="button" onClick={listen} aria-label={t('cost.voice')} className="btn btn-secondary w-12 shrink-0 px-0"><Mic size={20} aria-hidden /></button></Tooltip>}
        <button type="submit" className="btn btn-primary w-auto shrink-0" disabled={!text.trim() || parse.isPending}>{t('cost.read')}</button>
      </form>
      {parsed && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] bg-surface-2 p-3">
          {parsed.amountSen === null ? <p className="text-sm text-[var(--careful)]">{t('cost.noAmount')}</p> : (
            <div className="flex flex-wrap items-center gap-2">
              <b className="tabular-nums">{formatRM(parsed.amountSen)}</b>
              <Select label={t('cost.category')} hideLabel compact value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: t(`cost.${c}` as Key) }))} />
              <span className="text-[0.8125rem] text-muted">{t(`cost.tier.${parsed.tier}` as Key)}</span>
              <button type="button" className="btn btn-primary ml-auto w-auto" disabled={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</button>
            </div>
          )}
        </div>
      )}
      {(parse.isError || save.isError) && <p className="text-sm text-[var(--risky)]">{errorText(parse.error ?? save.error, lang, t('common.tryAgain'))}</p>}
      {list.data && <CostBars costs={list.data} />}
      {list.data && list.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {list.data.map((x) => (
            <li key={x.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">{t(`cost.${x.category}` as Key)}{x.note ? ` · ${x.note}` : ''}</span>
              <span className="tabular-nums">{formatRM(x.amountSen)}</span>
              <Tooltip side="bottom" text={t('common.delete')}><button type="button" aria-label={t('common.delete')} onClick={() => remove.mutate(x.id)} className="pressable grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2"><Trash2 size={18} aria-hidden /></button></Tooltip>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// This week's costs by category, biggest first. Only once there are 2+ categories to compare.
function CostBars({ costs }: { costs: { category: string; amountSen: number }[] }) {
  const { t } = useI18n()
  const by = new Map<string, number>()
  for (const c of costs) by.set(c.category, (by.get(c.category) ?? 0) + c.amountSen)
  if (by.size < 2) return null
  const rows = [...by].sort((a, b) => b[1] - a[1]).map(([c, sen]) => ({ label: t(`cost.${c}` as Key), value: sen, text: formatRM(sen) }))
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-muted">{t('chart.costsTitle')}</h3>
      <HBars rows={rows} color="var(--text-muted)" summary={t('chart.costsSummary')} />
    </div>
  )
}

type SpeechLike = { lang: string; start: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void }
