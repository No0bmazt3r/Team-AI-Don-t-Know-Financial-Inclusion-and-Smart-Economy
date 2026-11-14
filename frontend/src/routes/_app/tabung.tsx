import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Bike, Briefcase, Calculator, ChevronRight, Gift, GraduationCap, HeartPulse, Heart, House, Landmark, Loader2, Moon, Palmtree, PiggyBank, Plane, Plus, Shield,
  Siren, Smartphone, Sparkles, Users, type LucideIcon,
} from 'lucide-react'
import { createElement, useEffect, useState } from 'react'
import { Legend, LineChart } from '../../components/Chart'
import { Columns } from '../../components/Columns'
import { ErrorState } from '../../components/ErrorState'
import { GuideButton, GuideHint } from '../../components/Guide'
import { MoneyField } from '../../components/MoneyField'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Sheet } from '../../components/Sheet'
import { Skeleton } from '../../components/Skeleton'
import { useI18n, type Key } from '../../i18n/t'
import { api, carumanQuery, errorText, homeQuery, penampanHistoryQuery, type Pot, type PotSuggestion, potsQuery, prefetch } from '../../lib/api'
import { shortDate, weekLabel } from '../../lib/dates'
import { axisRM, formatRM } from '../../lib/money'

export const Route = createFileRoute('/_app/tabung')({ loader: prefetch(potsQuery, carumanQuery, homeQuery, penampanHistoryQuery), component: Tabung })

const KIND_ICON: Record<string, LucideIcon> = { penampan: Shield, cuti: Palmtree, kecemasan: Siren, motor: Bike, raya: Moon, isaraan: Landmark, perkeso: HeartPulse }
const CUSTOM_ICON: Record<string, LucideIcon> = { briefcase: Briefcase, users: Users, bike: Bike, gift: Gift, home: House, phone: Smartphone, graduation: GraduationCap, heart: Heart, plane: Plane, piggy: PiggyBank }
const iconOf = (p: Pick<Pot, 'kind' | 'icon'>) => KIND_ICON[p.kind] ?? CUSTOM_ICON[p.icon ?? ''] ?? PiggyBank
const rm = (sen: number) => formatRM(sen, { whole: true })
const pct = (p: Pot) => (p.targetSen ? Math.min(100, (p.balanceSen / p.targetSen) * 100) : 0)

// Pots split the rider's one real savings pocket into goals. Balances only change after "Dah pindah".
// Penampan is always there; the rider adds any other pot they want.
function Tabung() {
  const { t } = useI18n()
  const pots = useQuery(potsQuery)
  const caruman = useQuery(carumanQuery)
  const home = useQuery(homeQuery)
  const [open, setOpen] = useState<Pot | null>(null)
  // false: closed. true: the + sheet. A suggestion: open straight on that pot's plan.
  const [adding, setAdding] = useState<boolean | PotSuggestion>(false)
  const name = (p: Pot) => p.name ?? t(`pot.${p.kind}` as Key)

  if (pots.isPending || caruman.isPending) return <><ScreenHeader title={t('tabung.title')} /><Skeleton className="h-96" /></>
  if (pots.isError || caruman.isError) return <><ScreenHeader title={t('tabung.title')} /><ErrorState error={pots.error ?? caruman.error} onRetry={() => { pots.refetch(); caruman.refetch() }} /></>
  const pen = pots.data.find((p) => p.kind === 'penampan')!
  // The buffer's target is the engine's (two weeks of basics) unless the rider set their own
  const penampan = { ...pen, targetSen: pen.targetSen || (home.data?.salary?.buildUp?.targetSen ?? 0) }
  const mine = pots.data.filter((p) => p.kind !== 'penampan' && (p.active || p.balanceSen !== 0) && (p.kind !== 'perkeso' || !caruman.data.perkeso.deductedAtSource))
  const closed = pots.data.filter((p) => !p.active && p.kind.startsWith('c-') && p.balanceSen === 0)
  const total = penampan.balanceSen + mine.reduce((a, p) => a + p.balanceSen, 0)

  return (
    <>
      <ScreenHeader title={t('tabung.title')} action={<GuideButton screen="tabung" />} />
      <GuideHint screen="tabung" />
      <Columns>
      <div className="col">
        <section data-tour="total" className="flex flex-col gap-1 px-1">
          <p className="text-sm font-semibold text-muted">{t('tabung.total')}</p>
          <p className="text-[2.25rem] leading-[2.5rem] font-extrabold tracking-tight tabular-nums">{rm(total)}</p>
          <p className="text-sm text-muted">{t('tabung.onePocket')}</p>
        </section>

        <div data-tour="penampan" className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
        <button type="button" onClick={() => setOpen(pen)} className="pressable flex flex-col gap-3 p-4 text-left hover:bg-surface-2">
          <span className="flex items-center gap-3">
            <Shield size={22} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t('pot.penampan')}</span>
              <span className="block text-sm text-muted">{t('pot.penampan.what')}</span>
            </span>
            <span className="text-right tabular-nums">
              <b className="block text-lg">{rm(penampan.balanceSen)}</b>
              {penampan.targetSen > 0 && <span className="block text-[0.8125rem] text-muted">/ {rm(penampan.targetSen)}</span>}
            </span>
          </span>
          {penampan.targetSen > 0 && <Bar value={pct(penampan)} />}
        </button>
        <BufferChart targetSen={penampan.targetSen} />
        </div>

      </div>
      <div className="col">
        <section aria-labelledby="mine" className="flex flex-col gap-2">
          <h2 id="mine" className="px-1 text-sm font-semibold text-muted">{t('tabung.yourPots')}</h2>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {mine.length === 0 && <p className="p-4 text-sm text-muted">{t('tabung.empty')}</p>}
            <ul className="divide-y divide-line">
              {mine.map((p) => {
                const Icon = iconOf(p)
                return (
                  <li key={p.kind}>
                    <button type="button" onClick={() => setOpen(p)} className="pressable flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                      <Icon size={20} aria-hidden className="shrink-0 text-muted" />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-semibold">{name(p)}</span>
                          <b className="tabular-nums">{rm(p.balanceSen)}</b>
                        </span>
                        {p.targetSen > 0 && <Bar value={pct(p)} thin />}
                        <span className="text-[0.8125rem] text-muted tabular-nums">
                          {[p.weeklySen > 0 && t('tabung.perWeek', { amount: rm(p.weeklySen) }), p.targetSen > 0 && `${t('pot.target')} ${rm(p.targetSen)}`].filter(Boolean).join(' · ') || t(`pot.${p.kind}.what` as Key)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <button type="button" data-tour="add-pot" onClick={() => setAdding(true)} className="pressable flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left font-semibold hover:bg-surface-2">
              <Plus size={20} aria-hidden className="shrink-0" />
              {t('tabung.add')}
            </button>
          </div>
          {closed.length > 0 && (
            <details className="px-1 text-sm text-muted">
              <summary className="cursor-pointer py-1">{t('tabung.closed', { n: closed.length })}</summary>
              <ul className="mt-1 flex flex-col gap-1 pl-4">{closed.map((p) => <li key={p.kind}>{name(p)}</li>)}</ul>
            </details>
          )}
        </section>
      </div>
      </Columns>
      {/* Desktop only. Phones use the + sheet instead. */}
      <div className="max-lg:hidden">
        <SuggestionsPanel onPick={setAdding} />
      </div>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? name(open) : ''}>
        {open && <PotDetail pot={open} onDone={() => setOpen(null)} />}
      </Sheet>
      <Sheet open={adding !== false} onClose={() => setAdding(false)} title={t('tabung.add')}>
        {adding !== false && <AddPot initial={adding === true ? undefined : adding} onDone={() => setAdding(false)} />}
      </Sheet>
    </>
  )
}

function PotIcon({ kind, icon = null, className }: { kind: string; icon?: string | null; className?: string }) {
  return createElement(iconOf({ kind, icon }), { size: 20, 'aria-hidden': true, className })
}

// The Penampan balance after each confirmed transfer, with the target as a dashed line. Only with 2+ transfers.
function BufferChart({ targetSen }: { targetSen: number }) {
  const { t, lang } = useI18n()
  const q = useQuery(penampanHistoryQuery)
  const pts = q.data ?? []
  if (pts.length < 2) return null
  const color = 'var(--brand-text)'
  return (
    <section className="flex flex-col gap-2 border-t border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('chart.bufferTitle')}</h3>
        {targetSen > 0 && <Legend items={[{ color: 'var(--border-strong)', label: `${t('chart.target')} ${rm(targetSen)}`, line: true }]} />}
      </div>
      <LineChart
        values={pts.map((p) => p.balanceSen)}
        labels={pts.map((p) => shortDate(p.weekStart, lang))}
        color={color}
        target={targetSen || undefined}
        format={axisRM}
        summary={t('chart.bufferSummary', { first: rm(pts[0]!.balanceSen), last: rm(pts.at(-1)!.balanceSen) })}
        tips={pts.map((p) => ({ title: weekLabel(p.weekStart, lang), rows: [{ color, line: true, label: t('chart.balance'), value: rm(p.balanceSen) }] }))}
      />
    </section>
  )
}

function Bar({ value, thin = false }: { value: number; thin?: boolean }) {
  return (
    <span className={`block w-full overflow-hidden rounded-full bg-surface-2 ${thin ? 'h-1' : 'h-2'}`} aria-hidden>
      <span className="block h-full rounded-full bg-text" style={{ width: `${value}%` }} />
    </span>
  )
}

// One pot: edit its plan, its own extras (Cuti → leave planner, i-Saraan → government match), and close it.
function PotDetail({ pot, onDone }: { pot: Pot; onDone: () => void }) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<number | null>(pot.targetSen || null)
  const [weekly, setWeekly] = useState<number | null>(pot.weeklySen || null)
  const [closing, setClosing] = useState(false)
  const done = () => { onDone(); void queryClient.invalidateQueries() }
  const save = useMutation({
    mutationFn: () => api(`/api/pots/${pot.kind}`, { method: 'PATCH', body: pot.kind === 'penampan' ? { targetSen: target ?? 0 } : { targetSen: target ?? 0, weeklySen: weekly ?? 0 } }),
    onSuccess: done,
  })
  const close = useMutation({ mutationFn: () => api(`/api/pots/${pot.kind}/close`, { body: {} }), onSuccess: done })
  const closable = pot.kind !== 'penampan' && pot.kind !== 'perkeso'

  if (closing) {
    return (
      <div className="flex flex-col gap-4">
        <p>{t('tabung.closeConfirm', { amount: formatRM(pot.balanceSen) })}</p>
        {close.isError && <p role="alert" className="text-sm text-[var(--risky)]">{errorText(close.error, lang, t('common.tryAgain'))}</p>}
        <button type="button" className="btn btn-primary" disabled={close.isPending} onClick={() => close.mutate()}>{t('tabung.closeCta')}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setClosing(false)}>{t('tabung.back')}</button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <MoneyField label={t('pot.target')} valueSen={target} onChange={setTarget} />
        {pot.kind !== 'penampan' && <MoneyField label={t('pot.weeklyLabel')} valueSen={weekly} onChange={setWeekly} hint={t('pot.weeklyHint')} />}
        {save.isError && <p className="text-sm text-[var(--risky)]">{errorText(save.error, lang, t('common.tryAgain'))}</p>}
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>{t('common.save')}</button>
      </form>
      {pot.kind === 'cuti' && (
        <Link to="/cuti" className="pressable flex items-center gap-3 rounded-lg border border-line p-3 hover:bg-surface-2">
          <Palmtree size={20} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('cuti.entryTitle')}</span>
            <span className="block text-sm text-muted">{t('cuti.entryBody')}</span>
          </span>
          <ChevronRight size={18} className="text-muted" aria-hidden />
        </Link>
      )}
      {pot.kind === 'isaraan' && <Isaraan />}
      {closable && <button type="button" className="btn-ghost self-center text-sm text-[var(--risky)]" onClick={() => setClosing(true)}>{t('tabung.close')}</button>}
    </div>
  )
}

// The government match lives with the i-Saraan pot, shown only once the rider has added it.
function Isaraan() {
  const { t } = useI18n()
  const caruman = useQuery(carumanQuery)
  const [contributing, setContributing] = useState(false)
  if (!caruman.data) return null
  const c = caruman.data
  const isaraanPct = Math.min(100, (c.isaraan.paidYearSen / c.isaraan.fullMatchNeedsSen) * 100)
  if (contributing) return <ContributionForm onDone={() => setContributing(false)} />
  return (
    <section aria-labelledby="govt" className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="govt" className="font-semibold">{t('caruman.claimed')}</h3>
          <p className="text-sm text-muted">{t('caruman.claimedBody')}</p>
        </div>
        <p className="text-xl font-extrabold text-brand-text tabular-nums">{rm(c.governmentClaimedSen)}</p>
      </div>
      <div className="flex justify-between text-sm tabular-nums">
        <span>{t('caruman.isaraanProgress')}</span>
        <span>{rm(c.isaraan.paidYearSen)} / {rm(c.isaraan.fullMatchNeedsSen)}</span>
      </div>
      <Bar value={isaraanPct} />
      <p className="text-[0.8125rem] text-muted">{t('caruman.isaraanRule', { rate: Math.round(c.isaraan.rate * 100), cap: rm(c.isaraan.capSen), match: rm(c.isaraan.matchYearSen) })}</p>
      <button type="button" className="btn btn-secondary" onClick={() => setContributing(true)}>{t('caruman.record')}</button>
      <p className="flex items-center gap-2 text-sm text-muted">
        <HeartPulse size={16} aria-hidden />
        {t(c.perkeso.deductedAtSource ? 'caruman.perkesoDeducted' : 'caruman.perkesoReserve', { rate: (c.perkeso.rate * 100).toFixed(2) })}
      </p>
    </section>
  )
}

type Draft = { kind?: string; name: string; icon: string; reason?: string; targetSen: number | null; weeklySen: number | null }

// The "+" sheet: suggestions with reasons → a plan with the live salary preview → add.
const suggestionsQuery = { queryKey: ['pot-suggestions'], queryFn: () => api<{ suggestions: PotSuggestion[]; source: 'ai' | 'rules' }>('/api/pots/suggestions') }

// The suggested pots shown on desktop. Tapping one opens its plan.
function SuggestionsPanel({ onPick }: { onPick: (s: PotSuggestion | true) => void }) {
  const { t } = useI18n()
  const s = useQuery(suggestionsQuery)
  return (
    <section aria-labelledby="suggested" className="flex flex-col gap-2">
      <h2 id="suggested" className="px-1 text-sm font-semibold text-muted">{t('tabung.suggested')}</h2>
      {s.isPending ? (
        <Skeleton className="h-48" />
      ) : s.isError ? null : (
        <ul className="grid grid-cols-3 gap-3">
          {s.data.suggestions.length === 0 && <li className="col-span-full rounded-lg border border-line bg-surface p-4 text-sm text-muted">{t('tabung.noSuggestions')}</li>}
          {s.data.suggestions.map((x) => (
            <li key={x.kind} className={s.data.source === 'ai' ? 'ai-glow rounded-lg' : undefined}>
              <button type="button" onClick={() => onPick(x)} className="pressable flex h-full w-full items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left hover:bg-surface-2">
                <PotIcon kind={x.kind} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-semibold">{t(`pot.${x.kind}` as Key)}</span>
                    <span className="text-[0.8125rem] font-semibold tabular-nums">{t('tabung.perWeek', { amount: rm(x.weeklySen) })}</span>
                  </span>
                  <Reason text={x.reason} ai={s.data.source === 'ai'} />
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => onPick(true)} className="pressable flex h-full min-h-20 w-full items-center gap-3 rounded-lg border border-dashed border-line-strong p-4 text-left font-semibold hover:bg-surface-2">
              <Plus size={20} aria-hidden className="shrink-0" />
              {t('tabung.custom')}
            </button>
          </li>
        </ul>
      )}
      {s.data && <SourceNote ai={s.data.source === 'ai'} className="px-1" />}
    </section>
  )
}

/** The reason sentence. When the AI wrote it, it gets the AI tint and a label, so a rider can tell it apart from the
 * amounts next to it, which always come from the rules. */
function Reason({ text, ai }: { text: string; ai: boolean }) {
  const { t } = useI18n()
  if (!ai) return <span className="block text-sm text-muted">{text}</span>
  return (
    <span className="mt-1 block rounded-[var(--radius-sm)] border-l-2 border-[#8b5cf6] bg-[color-mix(in_srgb,#8b5cf6_8%,transparent)] px-2 py-1 text-sm">
      <span className="mr-1 inline-flex items-center gap-0.5 rounded-full bg-[linear-gradient(90deg,#8b5cf6,#38bdf8)] px-1.5 py-px align-[1px] text-[0.6875rem] font-bold text-white">
        <Sparkles size={10} aria-hidden />
        {t('ai.wrote')}
      </span>
      {text}
    </span>
  )
}

/** Always says where the suggestions came from, so a missing AI label is never a mystery. */
function SourceNote({ ai, className = '' }: { ai: boolean; className?: string }) {
  const { t } = useI18n()
  return (
    <p className={`flex items-start gap-1.5 text-[0.8125rem] text-muted ${className}`}>
      {ai ? <Sparkles size={14} aria-hidden className="mt-0.5 shrink-0 text-[#7c3aed]" /> : <Calculator size={14} aria-hidden className="mt-0.5 shrink-0" />}
      {t(ai ? 'tabung.byAi' : 'tabung.byRules')}
    </p>
  )
}

const draftOf = (x: PotSuggestion, name: string): Draft => ({ kind: x.kind, name, icon: '', reason: x.reason, targetSen: x.targetSen, weeklySen: x.weeklySen })

function AddPot({ onDone, initial }: { onDone: () => void; initial?: PotSuggestion }) {
  const { t } = useI18n()
  const s = useQuery(suggestionsQuery)
  const [draft, setDraft] = useState<Draft | null>(initial ? draftOf(initial, t(`pot.${initial.kind}` as Key)) : null)
  if (draft) return <PlanPot draft={draft} setDraft={setDraft} onDone={onDone} />
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-muted">{t('tabung.suggested')}</h3>
      {s.isPending ? (
        <Skeleton className="h-48" />
      ) : s.isError ? (
        <ErrorState error={s.error} onRetry={() => s.refetch()} />
      ) : (
        <>
          {s.data.suggestions.length === 0 && <p className="text-sm text-muted">{t('tabung.noSuggestions')}</p>}
          <div className={s.data.source === 'ai' ? 'ai-glow rounded-lg' : undefined}>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {s.data.suggestions.map((x) => {
              const Icon = iconOf({ kind: x.kind, icon: null })
              return (
                <li key={x.kind}>
                  <button type="button" onClick={() => setDraft(draftOf(x, t(`pot.${x.kind}` as Key)))} className="pressable flex w-full items-start gap-3 p-3 text-left hover:bg-surface-2">
                    <Icon size={20} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-semibold">{t(`pot.${x.kind}` as Key)}</span>
                        <span className="text-[0.8125rem] font-semibold tabular-nums">{t('tabung.perWeek', { amount: rm(x.weeklySen) })}</span>
                      </span>
                      <Reason text={x.reason} ai={s.data.source === 'ai'} />
                    </span>
                  </button>
                </li>
              )
            })}
            <li>
              <button type="button" onClick={() => setDraft({ name: '', icon: 'piggy', targetSen: null, weeklySen: null })} className="pressable flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2">
                <Plus size={20} aria-hidden className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t('tabung.custom')}</span>
                  <span className="block text-sm text-muted">{t('tabung.customBody')}</span>
                </span>
                <ChevronRight size={18} className="text-muted" aria-hidden />
              </button>
            </li>
          </ul>
          </div>
          <SourceNote ai={s.data.source === 'ai'} />
        </>
      )}
    </div>
  )
}

function PlanPot({ draft, setDraft, onDone }: { draft: Draft; setDraft: (d: Draft | null) => void; onDone: () => void }) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const custom = !draft.kind
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })

  // The salary preview follows the weekly amount, a moment after typing stops
  const [weekly, setWeekly] = useState(draft.weeklySen ?? 0)
  useEffect(() => {
    const id = setTimeout(() => setWeekly(draft.weeklySen ?? 0), 400)
    return () => clearTimeout(id)
  }, [draft.weeklySen])
  const preview = useQuery({
    queryKey: ['pot-preview', weekly],
    queryFn: async () => (await api<{ preview: { salarySen: number; newSalarySen: number } | null }>('/api/pots/preview', { body: { weeklySen: weekly } })).preview,
  })
  const classify = useMutation({
    mutationFn: (name: string) => api<{ icon: string; targetSen: number; weeklySen: number }>('/api/pots/classify', { body: { name } }),
    onSuccess: (r) => set({ icon: r.icon, targetSen: draft.targetSen ?? (r.targetSen || null), weeklySen: draft.weeklySen ?? (r.weeklySen || null) }),
  })
  const add = useMutation({
    mutationFn: () => api('/api/pots', { body: custom ? { name: draft.name.trim(), icon: draft.icon, targetSen: draft.targetSen ?? 0, weeklySen: draft.weeklySen ?? 0 } : { kind: draft.kind, targetSen: draft.targetSen ?? 0, weeklySen: draft.weeklySen ?? 0 } }),
    onSuccess: () => { onDone(); void queryClient.invalidateQueries() },
  })

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); add.mutate() }}>
      {!custom && (
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-surface-2 p-3">
          <PotIcon kind={draft.kind!} className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block font-semibold">{draft.name}</span>
            {draft.reason && <span className="block text-sm text-muted">{draft.reason}</span>}
          </span>
        </div>
      )}
      {custom && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{t('tabung.name')}</span>
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => draft.name.trim() && classify.mutate(draft.name.trim())} maxLength={40} required autoFocus placeholder={t('tabung.namePh')} className="h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 px-3" />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 flex items-center gap-2 text-sm font-semibold">{t('tabung.icon')} {classify.isPending && <Loader2 size={14} className="spin" aria-hidden />}</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CUSTOM_ICON).map(([id, Icon]) => (
                <button key={id} type="button" aria-label={id} aria-pressed={draft.icon === id} onClick={() => set({ icon: id })} className={`pressable grid size-11 place-items-center rounded-[var(--radius-md)] border ${draft.icon === id ? 'border-text bg-surface-2' : 'border-line'}`}>
                  <Icon size={20} aria-hidden />
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <MoneyField label={t('pot.target')} valueSen={draft.targetSen} onChange={(v) => set({ targetSen: v })} />
      <MoneyField label={t('pot.weeklyLabel')} valueSen={draft.weeklySen} onChange={(v) => set({ weeklySen: v })} hint={t('pot.weeklyHint')} />
      {preview.data && weekly > 0 && (
        <p role="status" className="rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm font-semibold tabular-nums">
          {t('tabung.preview', { from: rm(preview.data.salarySen), to: rm(preview.data.newSalarySen) })}
        </p>
      )}
      {add.isError && <p role="alert" className="text-sm text-[var(--risky)]">{errorText(add.error, lang, t('common.tryAgain'))}</p>}
      <button type="submit" className="btn btn-primary" disabled={add.isPending || (custom && !draft.name.trim())}>{t('tabung.addCta')}</button>
      <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>{t('tabung.back')}</button>
    </form>
  )
}

function ContributionForm({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState<number | null>(null)
  const [match, setMatch] = useState<number | null>(null)
  const save = useMutation({
    mutationFn: () => api<{ matchSen: number }>('/api/caruman/isaraan', { body: { amountSen: amount } }),
    onSuccess: (r) => {
      setMatch(r.matchSen)
      void queryClient.invalidateQueries()
    },
  })
  if (match !== null) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold">{t('caruman.matchEarned', { amount: formatRM(match) })}</p>
        <button type="button" className="btn btn-primary" onClick={onDone}>{t('common.done')}</button>
      </div>
    )
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (amount) save.mutate() }}>
      <p className="text-sm text-muted">{t('caruman.recordBody')}</p>
      <MoneyField label={t('caruman.amount')} valueSen={amount} onChange={setAmount} required autoFocus />
      {save.isError && <p className="text-sm text-[var(--risky)]">{errorText(save.error, lang, t('common.tryAgain'))}</p>}
      <button type="submit" className="btn btn-primary" disabled={!amount || save.isPending}>{t('common.save')}</button>
    </form>
  )
}
