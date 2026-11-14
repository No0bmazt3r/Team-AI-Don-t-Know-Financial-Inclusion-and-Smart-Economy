import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AdminTabs } from '../../components/AdminTabs'
import { BarChart, HBars, Legend, LineChart } from '../../components/Chart'
import { ErrorState } from '../../components/ErrorState'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Skeleton } from '../../components/Skeleton'
import { useI18n } from '../../i18n/t'
import { api } from '../../lib/api'
import { shortDate } from '../../lib/dates'

export const Route = createFileRoute('/_app/admin')({ component: Admin })

type Usage = {
  riders: { riders: number; onboarded: number; active7d: number; demos: number; pushReminders: number }
  retention: { cohort: number; week2: number | null; week3: number | null; week4: number | null }
  days: { day: string; active: number; calls: Record<string, number> }[]
  guides: Record<string, { started: number; completed: number; skipped: number }>
  llm: {
    days: number
    rows: { route: string; model: string; calls: number; riders: number; inputTokens: number; outputTokens: number; myr: number | null }[]
    riders: number
    myrPerRider: number | null
    pricesChecked: string | null
  }
}

const JOBS = ['snap', 'tanya', 'lender', 'bm', 'reco'] // the AI jobs, in their colour order
const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)

// The team's usage view (ADMIN_EMAILS only): counts, pilot retention and AI cost. No rider's data.
function Admin() {
  const { t, lang } = useI18n()
  const q = useQuery({ queryKey: ['admin'], queryFn: () => api<Usage>('/api/admin/usage') })
  if (q.isPending) return <Skeleton className="h-80" />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const { riders, retention, guides, llm, days } = q.data
  const stats: [string, number | string][] = [
    [t('admin.riders'), riders.riders],
    [t('admin.onboarded'), riders.onboarded],
    [t('admin.active'), riders.active7d],
    [t('admin.push'), riders.pushReminders],
    [t('admin.demos'), riders.demos],
    [t('admin.retention'), `${pct(retention.week2)} / ${pct(retention.week3)} / ${pct(retention.week4)}`],
  ]
  return (
    <>
      <ScreenHeader title={t('admin.title')} back />
      <AdminTabs />
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-surface p-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">{t('admin.cohort', { n: retention.cohort })}</p>
      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold">{t('admin.activeDaily')}</h2>
        <LineChart
          values={days.map((d) => d.active)}
          labels={days.map((d) => shortDate(d.day, lang))}
          color="var(--c-snap)"
          format={(v) => String(Math.round(v))}
          summary={t('admin.dailySummary', { what: t('admin.activeDaily'), max: Math.max(0, ...days.map((d) => d.active)) })}
          tips={days.map((d) => ({ title: shortDate(d.day, lang), rows: [{ color: 'var(--c-snap)', line: true, label: t('admin.riders'), value: String(d.active) }] }))}
        />
      </section>
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold">{t('admin.callsDaily')}</h2>
        <Legend items={JOBS.map((j) => ({ color: `var(--c-${j})`, label: j }))} />
        <BarChart
          cols={days.map((d) => ({ label: shortDate(d.day, lang), parts: JOBS.map((j) => ({ color: `var(--c-${j})`, value: d.calls[j] ?? 0 })) }))}
          format={(v) => String(Math.round(v))}
          summary={t('admin.dailySummary', { what: t('admin.callsDaily'), max: Math.max(0, ...days.map((d) => Object.values(d.calls).reduce((a, b) => a + b, 0))) })}
          tips={days.map((d) => ({
            title: shortDate(d.day, lang),
            rows: [...JOBS].reverse().filter((j) => d.calls[j]).map((j) => ({ color: `var(--c-${j})`, label: j, value: String(d.calls[j]) })),
          }))}
        />
      </section>
      </div>
      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold">{t('admin.guides')}</h2>
        {Object.keys(guides).length === 0 ? (
          <p className="text-sm text-muted">{t('admin.none')}</p>
        ) : (
          <>
            <Legend items={[{ color: 'var(--chart-bar)', label: t('admin.started') }, { color: 'var(--c-snap)', label: t('admin.finished') }]} />
            <HBars
              color="var(--c-snap)"
              summary={t('admin.guides')}
              rows={Object.entries(guides).sort((a, b) => b[1].started - a[1].started).map(([screen, g]) => ({
                label: screen[0]!.toUpperCase() + screen.slice(1),
                value: g.started,
                part: g.completed,
                text: `${g.started} → ${g.completed}${g.skipped ? ` · ${t('admin.skipped', { n: g.skipped })}` : ''}`,
              }))}
            />
          </>
        )}
      </section>
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold">{t('admin.llm', { n: llm.days })}</h2>
        {llm.rows.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.none')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-muted">
                <tr><th className="py-1 pr-2">Route</th><th className="pr-2">Model</th><th className="pr-2 text-right">{t('admin.calls')}</th><th className="pr-2 text-right">Tokens</th><th className="text-right">RM</th></tr>
              </thead>
              <tbody>
                {llm.rows.map((r) => (
                  <tr key={r.route + r.model} className="border-t border-line">
                    <td className="py-1 pr-2">{r.route}</td>
                    <td className="max-w-[8rem] truncate pr-2">{r.model}</td>
                    <td className="pr-2 text-right">{r.calls}</td>
                    <td className="pr-2 text-right">{(r.inputTokens + r.outputTokens).toLocaleString()}</td>
                    <td className="text-right">{r.myr === null ? '–' : r.myr.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm">
          {llm.myrPerRider === null ? t('admin.noPrices') : t('admin.perRider', { rm: llm.myrPerRider.toFixed(2), date: llm.pricesChecked ?? '' })}
        </p>
      </section>
      </div>
    </>
  )
}
