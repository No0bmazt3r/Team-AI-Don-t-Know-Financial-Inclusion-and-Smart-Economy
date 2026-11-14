import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Palmtree, Thermometer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Columns } from '../../components/Columns'
import { ErrorState } from '../../components/ErrorState'
import { RiskBadge } from '../../components/RiskBadge'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Skeleton } from '../../components/Skeleton'
import { WeekPicker } from '../../components/WeekPicker'
import { useI18n } from '../../i18n/t'
import { api, errorText, type LeavePreview, leaveQuery, prefetch } from '../../lib/api'
import { addDays, thisWeekStart, weekLabel } from '../../lib/dates'
import { formatRM } from '../../lib/money'
import { Chip } from '../onboarding'
import { Tooltip } from '../../components/Tooltip'

export const Route = createFileRoute('/_app/cuti')({ loader: prefetch(leaveQuery), component: Cuti })

// Cuti Berbayar: set a little aside every week, and the week off still pays, paid for by the
// rider's own good weeks.
function Cuti() {
  const { t, lang } = useI18n()
  const q = useQuery(leaveQuery)
  const queryClient = useQueryClient()
  const weeks = Array.from({ length: 51 }, (_, i) => addDays(thisWeekStart(), 7 * (i + 2)))
  const [label, setLabel] = useState('')
  const [start, setStart] = useState(weeks[3]!)
  const [length, setLength] = useState(1)
  const [preview, setPreview] = useState<LeavePreview | null>(null)
  const [sickDays, setSickDays] = useState(2)
  const body = { label: label.trim() || null, startWeek: start, weeks: length }

  const ask = useMutation({ mutationFn: () => api<LeavePreview>('/api/leave/preview', { body }), onSuccess: setPreview })
  const plan = useMutation({
    mutationFn: () => api('/api/leave', { body }),
    onSuccess: () => {
      setPreview(null)
      setLabel('')
      queryClient.invalidateQueries()
    },
  })
  const cancel = useMutation({ mutationFn: (id: number) => api(`/api/leave/${id}`, { method: 'DELETE' }), onSuccess: () => queryClient.invalidateQueries() })
  const sick = useMutation({ mutationFn: () => api('/api/leave/sick', { body: { days: sickDays } }), onSuccess: () => queryClient.invalidateQueries() })
  const rm = (sen: number) => formatRM(sen, { whole: true })

  return (
    <>
      <ScreenHeader title={t('cuti.title')} back />
      <Columns>
      <div className="col">
      <section className="flex flex-col gap-4 rounded-lg border-2 border-outline bg-surface p-5">
        <h2 className="flex items-center gap-2 text-xl font-bold"><Palmtree size={22} aria-hidden /> {t('cuti.planTitle')}</h2>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('cuti.label')}
          <input value={label} onChange={(e) => { setLabel(e.target.value); setPreview(null) }} placeholder={t('cuti.labelPlaceholder')} maxLength={40} className="h-12 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 text-base font-normal" />
        </label>
        <WeekPicker label={t('cuti.start')} value={start} span={length} min={weeks[0]!} max={weeks.at(-1)!} onChange={(v) => { setStart(v); setPreview(null) }} />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t('cuti.length')}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('cuti.length')}>
            {[1, 2, 3, 4].map((n) => <Chip key={n} on={length === n} onClick={() => { setLength(n); setPreview(null) }}>{t('cuti.weeksN', { n })}</Chip>)}
          </div>
        </div>
        {!preview ? (
          <button type="button" className="btn btn-primary" disabled={ask.isPending} onClick={() => ask.mutate()}>{t('cuti.preview')}</button>
        ) : (
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-surface-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{t('cuti.previewTitle')}</span>
              <RiskBadge risk={preview.risk} pSafe={preview.pSafe} size="sm" />
            </div>
            <p>{t('cuti.setAside', { amount: rm(preview.setAsideWeekSen), weeks: preview.weeksUntil })}</p>
            <p className="text-sm text-muted">{t('cuti.salaryEffect', { amount: rm(preview.salarySen), delta: rm(Math.abs(preview.salaryDeltaSen)) })}</p>
            <p className="text-sm">{t('cuti.paidBy')}</p>
            <button type="button" className="btn btn-primary" disabled={plan.isPending} onClick={() => plan.mutate()}>{t('cuti.confirm')}</button>
          </div>
        )}
        {(ask.isError || plan.isError) && <p role="alert" className="text-sm font-semibold text-[var(--risky)]">{errorText(ask.error ?? plan.error, lang, t('common.tryAgain'))}</p>}
      </section>
      </div>
      <div className="col">

      {q.isPending ? <Skeleton className="h-24" /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          {q.data.leave.some((l) => l.kind === 'planned') && (
            <section aria-labelledby="planned" className="flex flex-col gap-2">
              <h2 id="planned" className="px-1 text-sm font-semibold text-muted">{t('cuti.planned')}</h2>
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                {q.data.leave.filter((l) => l.kind === 'planned').map((l) => (
                  <li key={l.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{l.label || t('cuti.untitled')}</p>
                      <p className="text-sm text-muted">{weekLabel(l.startWeek, lang)} · {t('cuti.weeksN', { n: l.weeks })} · {t('pot.weekly', { amount: rm(l.setAsideWeekSen) })}</p>
                    </div>
                    <Tooltip side="bottom" text={t('common.delete')}><button type="button" aria-label={t('common.delete')} onClick={() => cancel.mutate(l.id)} className="pressable grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2">
                      <Trash2 size={20} aria-hidden />
                    </button></Tooltip>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Thermometer size={18} aria-hidden /> {t('cuti.sickTitle')}</h2>
            <p className="text-sm text-muted">{t('cuti.sickCovered', { covered: q.data.sick.daysCovered, used: q.data.sick.daysUsed })}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('cuti.sickDays')}>
              {[1, 2, 3, 4, 5, 6].map((n) => <Chip key={n} on={sickDays === n} onClick={() => setSickDays(n)}>{t('cuti.daysN', { n })}</Chip>)}
            </div>
            <button type="button" className="btn btn-secondary" disabled={sick.isPending} onClick={() => sick.mutate()}>{t('cuti.sickButton')}</button>
            {sick.isSuccess && <p role="status" className="text-sm font-semibold">{t('cuti.sickDone')}</p>}
          </section>
        </>
      )}
      </div>
      </Columns>
    </>
  )
}
