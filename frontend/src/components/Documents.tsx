import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Lock, QrCode, Receipt } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useI18n, type Key } from '../i18n/t'
import { api, penyataQuery } from '../lib/api'
import { formatRM } from '../lib/money'
import { Select } from './Select'
import { Skeleton } from './Skeleton'

type Lang = 'ms' | 'en'
type TaxYear = {
  year: number
  weeks: number
  weeksPossible: number
  totals: { receiptsSen: number; feesSen: number; netSen: number }
  costs: { business: { totalSen: number }; asset: { totalSen: number } }
  afterBusinessCostsSen: number
}
type DocCode = { id: number; kind: 'loan' | 'tax'; label: string; hint: string; expiresAt: string; openedCount: number }

const codesQuery = { queryKey: ['doc-codes'], queryFn: async () => (await api<{ codes: DocCode[] }>('/api/doc-codes')).codes }

/** Records → Documents: the Loan pack and the Tax year summary, both PDFs with a verify code, and the codes made. */
export function Documents() {
  const { t } = useI18n()
  const [tab, setTab] = useState<'loan' | 'tax'>('loan')
  return (
    <section aria-labelledby="docs" className="flex flex-col gap-3">
      <h2 id="docs" className="px-1 text-sm font-semibold text-muted">{t('docs.title')}</h2>
      {/* One document at a time: a tab switch keeps the section short on a phone. */}
      <div role="tablist" aria-label={t('docs.title')} className="relative grid grid-cols-2 rounded-full border border-line bg-surface-2 p-1">
        <span aria-hidden className="seg-pill rounded-full bg-text shadow-sm" style={{ '--i': tab === 'loan' ? 0 : 1, '--n': 2 } as CSSProperties} />
        {(['loan', 'tax'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`doc-tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`doc-panel-${k}`}
            onClick={() => setTab(k)}
            className={`pressable relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors duration-200 ${tab === k ? 'text-bg' : 'text-muted hover:text-text'}`}
          >
            {k === 'loan' ? <FileText size={16} aria-hidden /> : <Receipt size={16} aria-hidden />}
            {t(k === 'loan' ? 'docs.loanTitle' : 'docs.taxTab')}
          </button>
        ))}
      </div>
      <div key={tab} role="tabpanel" id={`doc-panel-${tab}`} aria-labelledby={`doc-tab-${tab}`} className="panel-in">
        {tab === 'loan' ? <LoanPack /> : <TaxSummary />}
      </div>
      <Codes />
    </section>
  )
}

/** A one-row choice of a few options, equal widths, so it never wraps onto a second line. */
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.8125rem] font-semibold text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="relative grid rounded-[var(--radius-md)] border border-line bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        <span aria-hidden className="seg-pill rounded-[calc(var(--radius-md)-4px)] bg-surface shadow-sm ring-1 ring-line-strong" style={{ '--i': Math.max(0, options.findIndex((o) => o.value === value)), '--n': options.length } as CSSProperties} />
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={`pressable relative z-10 min-h-11 truncate rounded-[calc(var(--radius-md)-4px)] px-2 text-sm font-semibold transition-colors duration-200 ${value === o.value ? 'text-text' : 'text-muted hover:text-text'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Card({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-outline bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2">{icon}</span>
        <div className="min-w-0">
          <h3 className="font-bold">{title}</h3>
          <p className="text-sm text-muted">{body}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

/** PDF language: the app's by default, either on request (an officer may want English). */
function LangPick({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  const { t } = useI18n()
  return <Segmented label={t('docs.language')} value={value} onChange={onChange} options={[{ value: 'ms', label: 'Bahasa Melayu' }, { value: 'en', label: 'English' }]} />
}

/** A plain link (the browser downloads it), then the new code shows up in the list. */
function DownloadButton({ href, label }: { href: string; label: string }) {
  const queryClient = useQueryClient()
  return (
    <a href={href} download onClick={() => setTimeout(() => queryClient.invalidateQueries({ queryKey: ['doc-codes'] }), 2000)} className="btn btn-primary">
      <Download size={18} aria-hidden /> {label}
    </a>
  )
}

function LoanPack() {
  const { t, lang } = useI18n()
  const p = useQuery(penyataQuery)
  const [months, setMonths] = useState(6)
  const [pdfLang, setPdfLang] = useState<Lang>(lang)
  if (!p.data) return <Skeleton className="h-56" />
  if (!p.data.unlocked) {
    return (
      <Card icon={<Lock size={20} aria-hidden />} title={t('docs.loanTitle')} body={t('penyata.locked', { n: p.data.weeksLogged, total: p.data.unlockAt })}>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden><div className="h-full rounded-full bg-brand" style={{ width: `${(p.data.weeksLogged / p.data.unlockAt) * 100}%` }} /></div>
      </Card>
    )
  }
  const s = p.data.summary!
  return (
    <Card icon={<FileText size={20} aria-hidden />} title={t('docs.loanTitle')} body={t('docs.loanBody')}>
      <p className="text-sm">{t('penyata.summary', { avg: formatRM(s.avgSen, { whole: true }), weeks: s.weeks })} · <span className="text-muted">{t(`source.${s.source}` as Key)}</span></p>
      <Segmented label={t('docs.period')} value={months} onChange={setMonths} options={[3, 6, 12].map((m) => ({ value: m, label: t('docs.monthsN', { n: m }) }))} />
      <LangPick value={pdfLang} onChange={setPdfLang} />
      <DownloadButton href={`/api/penyata.pdf?months=${months}&lang=${pdfLang}`} label={t('docs.download')} />
      <p className="text-[0.8125rem] text-muted">{t('docs.loanNote')}</p>
    </Card>
  )
}

function TaxSummary() {
  const { t, lang } = useI18n()
  const years = useQuery({ queryKey: ['tax-years'], queryFn: async () => (await api<{ years: { year: number; weeks: number }[] }>('/api/tax-years')).years })
  const [picked, setPicked] = useState<number | null>(null)
  const year = picked ?? years.data?.[0]?.year ?? null
  const s = useQuery({ queryKey: ['tax-year', year], queryFn: () => api<TaxYear>(`/api/tax-year/${year}`), enabled: year !== null })
  const [pdfLang, setPdfLang] = useState<Lang>(lang)
  const rm = (sen: number) => formatRM(sen, { whole: true })
  if (years.isPending) return <Skeleton className="h-56" />
  if (!years.data?.length || year === null) {
    return <Card icon={<Receipt size={20} aria-hidden />} title={t('docs.taxTitle')} body={t('docs.taxEmpty')}><span /></Card>
  }
  return (
    <Card icon={<Receipt size={20} aria-hidden />} title={t('docs.taxTitle')} body={t('docs.taxBody')}>
      {years.data.length > 1 && (
        <Select compact label={t('docs.year')} value={year} onChange={setPicked} options={years.data.map((y) => ({ value: y.year, label: `${y.year}`, hint: t('docs.weeksN', { n: y.weeks }) }))} />
      )}
      {s.data ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm">
          <dt className="text-muted">{t('docs.receipts')}</dt><dd className="text-right tabular-nums">{rm(s.data.totals.receiptsSen)}</dd>
          <dt className="text-muted">{t('docs.fees')}</dt><dd className="text-right tabular-nums">−{rm(s.data.totals.feesSen)}</dd>
          <dt className="text-muted">{t('docs.business')}</dt><dd className="text-right tabular-nums">−{rm(s.data.costs.business.totalSen)}</dd>
          <dt className="font-semibold">{t('docs.after')}</dt><dd className="text-right font-bold tabular-nums">{rm(s.data.afterBusinessCostsSen)}</dd>
          <dd className="col-span-2 text-[0.8125rem] text-muted">{t('docs.recorded', { n: s.data.weeks, of: s.data.weeksPossible, year: s.data.year })}</dd>
        </dl>
      ) : <Skeleton className="h-28" />}
      <LangPick value={pdfLang} onChange={setPdfLang} />
      <DownloadButton href={`/api/tax-year.pdf?year=${year}&lang=${pdfLang}`} label={t('docs.download')} />
      <p className="text-[0.8125rem] text-muted">{t('docs.taxNote')}</p>
    </Card>
  )
}

/** Codes printed on PDFs. Cancelling one makes that PDF fail the check, e.g. if it was sent to the wrong person. */
function Codes() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const codes = useQuery(codesQuery)
  const revoke = useMutation({ mutationFn: (id: number) => api(`/api/doc-codes/${id}`, { method: 'DELETE' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doc-codes'] }) })
  const live = codes.data ?? [] // the API lists live codes only
  if (!live.length) return null
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 px-1 text-sm font-semibold text-muted"><QrCode size={16} aria-hidden /> {t('docs.codes')}</h3>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {live.slice(0, 6).map((c) => (
          <li key={c.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{c.kind === 'loan' ? t('docs.codeLoan', { n: c.label }) : t('docs.codeTax', { year: c.label })} <span className="font-mono text-muted">…{c.hint}</span></p>
              <p className="text-muted">{t('docs.codeRow', { date: c.expiresAt.slice(0, 10), n: c.openedCount })}</p>
            </div>
            <button type="button" className="btn-ghost min-h-11 px-2 text-sm font-semibold text-[var(--risky)]" disabled={revoke.isPending} onClick={() => revoke.mutate(c.id)}>{t('docs.cancel')}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
