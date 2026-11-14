import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Calculator, FileText, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Chip } from '../onboarding'
import { ResultPlaceholder } from '../../components/EmptyState'
import { InfoTip } from '../../components/InfoTip'
import { MoneyField } from '../../components/MoneyField'
import { RiskBadge } from '../../components/RiskBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useI18n } from '../../i18n/t'
import { api, errorText, penyataQuery, prefetch, type Risk } from '../../lib/api'
import { formatRM } from '../../lib/money'

type Layak = { item: string; loanSen: number; interestSen: number; monthlySen: number; totalSen: number; effectivePctYear: number; salarySen: number; newSalarySen: number; pSafe: number; risk: Risk }

export const Route = createFileRoute('/_app/layak')({ loader: prefetch(penyataQuery), component: SemakLayak })

// Semak Layak: what an instalment does to the rider's own future weeks. A risky answer is shown as
// plainly as a safe one, and Coinvoy earns the same either way.
function SemakLayak() {
  const { t, lang } = useI18n()
  const penyata = useQuery(penyataQuery)
  const [item, setItem] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [deposit, setDeposit] = useState<number | null>(null)
  const [months, setMonths] = useState(12)
  const [rate, setRate] = useState('8')
  const check = useMutation({
    mutationFn: () => api<Layak>('/api/layak', { body: { item: item.trim() || t('layak.itemDefault'), priceSen: price, depositSen: deposit ?? 0, months, flatRatePct: Number(rate) || 0 } }),
  })
  const r = check.data
  const rm = (sen: number) => formatRM(sen, { whole: true })
  return (
    <>
      <ScreenHeader title={t('layak.title')} back />
      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <form className="flex flex-col gap-4 rounded-lg border-2 border-outline bg-surface p-5" onSubmit={(e) => { e.preventDefault(); if (price) check.mutate() }}>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t('layak.item')}
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder={t('layak.itemPlaceholder')} maxLength={40} className="h-12 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 text-base font-normal" />
          </label>
          <MoneyField label={t('layak.price')} valueSen={price} onChange={setPrice} required />
          <MoneyField label={t('layak.deposit')} valueSen={deposit} onChange={setDeposit} />
          <TermField months={months} onChange={setMonths} />
          <label className="flex flex-col gap-1 text-sm font-semibold">
            <span className="flex items-center gap-1">{t('layak.rate')}<InfoTip term={t('layak.rate')} text={t('term.flatRate')} /></span>
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} className="h-12 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 text-base font-normal tabular-nums" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!price || check.isPending}>{t('layak.check')}</button>
          {check.isError && <p role="alert" className="text-sm font-semibold text-[var(--risky)]">{errorText(check.error, lang, t('common.tryAgain'))}</p>}
        </form>

        {!r && <ResultPlaceholder icon={Calculator} body={t('common.resultHere')} />}
        {r && (
          <section aria-live="polite" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
            <RiskBadge risk={r.risk} pSafe={r.pSafe} />
            <p className="text-lg font-medium">{t(`layak.verdict.${r.risk}`, { item: r.item })}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">{t('layak.monthly')}</dt><dd className="text-right font-bold tabular-nums">{formatRM(r.monthlySen)}</dd>
              <dt className="text-muted">{t('layak.interest')}</dt><dd className="text-right tabular-nums">{formatRM(r.interestSen)}</dd>
              <dt className="text-muted">{t('layak.flatVsReal')}</dt><dd className="text-right tabular-nums">{rate}% → {r.effectivePctYear}%</dd>
              <dt className="text-muted">{t('layak.salary')}</dt><dd className="text-right tabular-nums">{rm(r.salarySen)} → <b>{rm(r.newSalarySen)}</b></dd>
            </dl>
            <p className="text-[0.8125rem] text-muted">{t('layak.flatNote')}</p>
            <p className="text-[0.8125rem] text-muted">{t('layak.sameEarn')}</p>
            {penyata.data?.unlocked && (
              <Link to="/rekod" className="btn btn-secondary"><FileText size={18} aria-hidden /> {t('layak.surat')}</Link>
            )}
          </section>
        )}
      </div>
      <p className="text-[0.8125rem] text-muted">{t('common.disclaimer')}</p>
    </>
  )
}

const MAX_MONTHS = 120 // the API's limit: 10 years
const PRESETS = [6, 12, 24, 36, 60, 84]

/** Loan length as years + months. Quick chips for the usual terms; the two steppers reach anything up to 10 years. */
function TermField({ months, onChange }: { months: number; onChange: (m: number) => void }) {
  const { t } = useI18n()
  const years = Math.floor(months / 12)
  const rest = months % 12
  const set = (y: number, m: number) => onChange(Math.min(MAX_MONTHS, Math.max(1, y * 12 + m)))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">{t('layak.term')}</legend>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => <Chip key={p} on={months === p} onClick={() => onChange(p)}>{termLabel(t, p, true)}</Chip>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stepper label={t('layak.years')} value={years} min={0} max={10} onChange={(y) => set(y, y === 10 ? 0 : rest)} />
        <Stepper label={t('layak.monthsPart')} value={rest} min={0} max={11} disabled={years === 10} onChange={(m) => set(years, m)} />
      </div>
      <p className="text-[0.8125rem] text-muted" aria-live="polite">{t('layak.termTotal', { term: termLabel(t, months, false), months })}</p>
    </fieldset>
  )
}

function termLabel(t: ReturnType<typeof useI18n>['t'], months: number, short: boolean) {
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts = [y ? t(short ? 'layak.yShort' : 'layak.yLong', { n: y }) : '', m ? t(short ? 'layak.mShort' : 'layak.mLong', { n: m }) : ''].filter(Boolean)
  return parts.join(' ')
}

/** − [n] + with a typed box that only commits on blur or Enter, so clearing it to type "84" doesn't snap to 1. */
function Stepper({ label, value, min, max, onChange, disabled = false }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (draft !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))))
    setDraft(null)
  }
  const btn = 'pressable grid size-12 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-line-strong bg-surface hover:bg-surface-2 disabled:opacity-40'
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.8125rem] font-semibold text-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} aria-label={`${label} −1`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}><Minus size={18} aria-hidden /></button>
        <input
          inputMode="numeric"
          aria-label={label}
          disabled={disabled}
          value={draft ?? String(value)}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
          className="h-12 w-full min-w-0 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 text-center text-base font-semibold tabular-nums disabled:opacity-40"
        />
        <button type="button" className={btn} aria-label={`${label} +1`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}><Plus size={18} aria-hidden /></button>
      </div>
    </div>
  )
}
