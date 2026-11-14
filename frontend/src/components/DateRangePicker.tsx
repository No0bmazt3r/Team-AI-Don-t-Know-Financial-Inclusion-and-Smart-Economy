import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import cal from '../../../backend/ml/app/engine/data/calendar_my.json'
import { dayCount, useI18n } from '../i18n/t'
import { addDays, daysBetween, rangeLabel, weekStart } from '../lib/dates'
import { Sheet } from './Sheet'

// One source of dates: the same Malaysian calendar the salary engine uses (public holidays, Ramadan, school holidays).
const HOLIDAYS = cal.public_holidays as Record<string, string>
const inRanges = (iso: string, ranges: string[][]) => ranges.some(([a, b]) => iso >= a! && iso <= b!)
const isRamadan = (iso: string) => inRanges(iso, cal.ramadan)
const isSchool = (iso: string) => inRanges(iso, cal.school_holidays)
const touches = (from: string, to: string, ranges: string[][]) => ranges.some(([a, b]) => !(b! < from || a! > to))

const monthOf = (iso: string) => iso.slice(0, 7) // YYYY-MM
const shiftMonth = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}
/** The Mondays of every week that touches this month. */
function weeksOf(ym: string): string[] {
  const out: string[] = []
  for (let mon = weekStart(`${ym}-01`); monthOf(mon) <= ym; mon = addDays(mon, 7)) out.push(mon)
  return out
}

export type Range = { start: string; end: string }

/**
 * Pick leave by the day: tap the first day, then the last. The days between light up as one band, with a running
 * count. Holidays, Ramadan and school holidays are marked so a rider can plan around them.
 * A bottom sheet on phones, a centred dialog on desktop (the shared Sheet).
 */
export function DateRangePicker({ label, value, onChange, min, max, maxDays }: { label: string; value: Range; onChange: (r: Range) => void; min: string; max: string; maxDays: number }) {
  const { t, lang } = useI18n()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(monthOf(value.start))
  const [draft, setDraft] = useState<{ start: string; end: string | null }>(value) // end null = waiting for the last day
  const locale = lang === 'ms' ? 'ms-MY' : 'en-GB'
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
  const dayNames = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))))
  const longDate = (iso: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

  const shown = { start: draft.start, end: draft.end ?? draft.start }
  const n = daysBetween(shown.start, shown.end)
  const holidaysIn = (r: Range) => Object.entries(HOLIDAYS).filter(([d]) => d >= r.start && d <= r.end)
  const during = holidaysIn(shown)
  const lastAllowed = draft.end === null ? [addDays(draft.start, maxDays - 1), max].sort()[0]! : max

  const tap = (day: string) => {
    // First tap (or a tap before the start) begins a new range; the next tap closes it.
    if (draft.end !== null || day < draft.start) setDraft({ start: day, end: null })
    else setDraft({ start: draft.start, end: day })
  }
  const openPicker = () => { setDraft(value); setMonth(monthOf(value.start)); setOpen(true) }
  const done = () => { onChange(shown); setOpen(false) }
  const fieldHolidays = holidaysIn(value).length

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span id={id} className="text-sm font-semibold">{label}</span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-labelledby={`${id} ${id}-v`}
        onClick={openPicker}
        className="pressable flex h-12 w-full items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 px-3.5 text-left text-base hover:border-text"
      >
        <CalendarDays size={18} aria-hidden className="shrink-0 text-muted" />
        <span id={`${id}-v`} className="min-w-0 flex-1 truncate">
          {rangeLabel(value.start, value.end, lang)} <span className="text-muted">· {dayCount(t, daysBetween(value.start, value.end))}</span>
        </span>
        {fieldHolidays > 0 && <span className="shrink-0 rounded-full bg-[var(--careful-bg)] px-2 py-0.5 text-[0.75rem] font-semibold text-[var(--careful)]">{t('picker.holidaysN', { n: fieldHolidays })}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="flex flex-col gap-3">
          <p aria-live="polite" className="text-sm text-muted">{draft.end === null ? t('picker.tapLast') : t('picker.tapFirst')}</p>
          <div className="flex items-center justify-between">
            <button type="button" aria-label={t('picker.prev')} disabled={month <= monthOf(min)} onClick={() => setMonth(shiftMonth(month, -1))} className="pressable grid size-11 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30">
              <ChevronLeft size={22} aria-hidden />
            </button>
            <h3 aria-live="polite" className="font-bold capitalize">{monthName}</h3>
            <button type="button" aria-label={t('picker.next')} disabled={month >= monthOf(max)} onClick={() => setMonth(shiftMonth(month, 1))} className="pressable grid size-11 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30">
              <ChevronRight size={22} aria-hidden />
            </button>
          </div>

          <div aria-hidden className="grid grid-cols-7 text-center text-[0.75rem] font-semibold text-muted">
            {dayNames.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div role="grid" aria-label={monthName} className="flex flex-col gap-1">
            {weeksOf(month).map((mon) => (
              <div key={mon} role="row" className="grid grid-cols-7">
                {Array.from({ length: 7 }, (_, i) => {
                  const day = addDays(mon, i)
                  const outside = monthOf(day) !== month
                  const off = day < min || day > lastAllowed
                  const inRange = day >= shown.start && day <= shown.end
                  const isStart = day === shown.start
                  const isEnd = day === shown.end
                  const holiday = HOLIDAYS[day]
                  // The band: square inside, rounded at the range's ends and at the row's edges.
                  const band = inRange ? `bg-text/10 ${isStart || i === 0 ? 'rounded-l-full' : ''} ${isEnd || i === 6 ? 'rounded-r-full' : ''}` : ''
                  return (
                    <div key={day} role="gridcell" className={`flex justify-center ${band}`}>
                      <button
                        type="button"
                        disabled={off}
                        aria-pressed={inRange}
                        aria-label={`${longDate(day)}${holiday ? `, ${holiday}` : ''}`}
                        onClick={() => tap(day)}
                        title={holiday}
                        className={`pressable relative flex size-11 flex-col items-center justify-center rounded-full text-sm tabular-nums transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30
                          ${isStart || isEnd ? 'bg-text font-bold text-bg' : inRange ? 'font-semibold' : 'hover:bg-surface-2'}
                          ${outside && !inRange ? 'text-muted' : ''} ${holiday && !(isStart || isEnd) ? 'font-bold' : ''}`}
                      >
                        <span className={isSchool(day) && !inRange ? 'rounded-sm bg-[var(--safe-bg)] px-1' : 'px-1'}>{Number(day.slice(8))}</span>
                        <span className="flex h-1.5 gap-0.5">
                          {holiday && <span className="size-1.5 rounded-full bg-[var(--careful)]" />}
                          {isRamadan(day) && <span className={`size-1.5 rounded-full ${isStart || isEnd ? 'bg-bg' : 'bg-text/50'}`} />}
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <ul aria-label={t('picker.legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-muted">
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--careful)]" />{t('picker.holiday')}</li>
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-text/50" />{t('picker.ramadan')}</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-sm bg-[var(--safe-bg)]" />{t('picker.school')}</li>
          </ul>

          <div className="rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm" aria-live="polite">
            <p className="font-semibold">{t('picker.yourLeave', { weeks: `${rangeLabel(shown.start, shown.end, lang)} · ${dayCount(t, n)}` })}</p>
            {during.length > 0 && <p className="text-muted">{t('picker.includes', { names: during.map(([, name]) => name).join(', ') })}</p>}
            {touches(shown.start, shown.end, cal.ramadan) && <p className="text-muted">{t('picker.inRamadan')}</p>}
            {touches(shown.start, shown.end, cal.school_holidays) && <p className="text-muted">{t('picker.inSchool')}</p>}
            {draft.end === null && <p className="text-muted">{t('picker.maxDays', { n: maxDays })}</p>}
          </div>
          <button type="button" className="btn btn-primary" onClick={done}>{t('common.done')}</button>
        </div>
      </Sheet>
    </div>
  )
}
