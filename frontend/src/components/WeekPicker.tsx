import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import cal from '../../../backend/ml/app/engine/data/calendar_my.json'
import { useI18n } from '../i18n/t'
import { addDays, weekLabel } from '../lib/dates'
import { Sheet } from './Sheet'

// One source of dates: the same Malaysian calendar the salary engine uses (public holidays, Ramadan, school holidays).
const HOLIDAYS = cal.public_holidays as Record<string, string>
const inRanges = (iso: string, ranges: string[][]) => ranges.some(([a, b]) => iso >= a! && iso <= b!)
const isRamadan = (iso: string) => inRanges(iso, cal.ramadan)
const isSchool = (iso: string) => inRanges(iso, cal.school_holidays)

const monthOf = (iso: string) => iso.slice(0, 7) // YYYY-MM
const shiftMonth = (ym: string, n: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}
/** The Mondays of every week that touches this month. */
function weeksOf(ym: string): string[] {
  const first = `${ym}-01`
  let mon = addDays(first, -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7))
  const out: string[] = []
  while (monthOf(mon) <= ym) {
    out.push(mon)
    mon = addDays(mon, 7)
  }
  return out
}

/**
 * Pick a starting week on a month calendar. Tapping any day picks its whole Mon–Sun week, and the leave length shows
 * as a band. Holidays, Ramadan and school holidays are marked so a rider can plan around them.
 * A bottom sheet on phones, a centred dialog on desktop (the shared Sheet).
 */
export function WeekPicker({ label, value, onChange, min, max, span = 1 }: { label: string; value: string; onChange: (monday: string) => void; min: string; max: string; span?: number }) {
  const { t, lang } = useI18n()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(monthOf(value))
  const locale = lang === 'ms' ? 'ms-MY' : 'en-GB'
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
  const dayNames = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))))
  const lastPicked = addDays(value, 7 * (span - 1))
  const picked = (mon: string) => mon >= value && mon <= lastPicked
  // Holidays inside the picked leave, listed under the calendar.
  const during = Object.entries(HOLIDAYS).filter(([d]) => d >= value && d <= addDays(lastPicked, 6))
  const end = addDays(lastPicked, 6)
  const spanTouches = (a: string, b: string) => !(b < value || a > end)
  const ramadanDuring = cal.ramadan.some(([a, b]) => spanTouches(a!, b!))
  const schoolDuring = cal.school_holidays.some(([a, b]) => spanTouches(a!, b!))

  const openPicker = () => { setMonth(monthOf(value)); setOpen(true) }
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
          {span > 1 ? `${weekLabel(value, lang)} → ${weekLabel(lastPicked, lang)}` : weekLabel(value, lang)}
        </span>
        {during.length > 0 && <span className="shrink-0 rounded-full bg-[var(--careful-bg)] px-2 py-0.5 text-[0.75rem] font-semibold text-[var(--careful)]">{t('picker.holidaysN', { n: during.length })}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="flex flex-col gap-3">
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
          {/* Each week is one button: the leave is planned by the week, so a week is what you tap. */}
          <div className="flex flex-col gap-1">
            {weeksOf(month).map((mon) => {
              const off = mon < min || mon > max
              const on = picked(mon)
              return (
                <button
                  key={mon}
                  type="button"
                  disabled={off}
                  aria-pressed={on}
                  aria-label={weekLabel(mon, lang)}
                  onClick={() => { onChange(mon); setOpen(false) }}
                  className={`pressable grid min-h-12 grid-cols-7 rounded-[var(--radius-md)] text-center tabular-nums disabled:cursor-not-allowed disabled:opacity-30 ${on ? 'bg-text text-bg' : 'hover:bg-surface-2'}`}
                >
                  {Array.from({ length: 7 }, (_, i) => {
                    const day = addDays(mon, i)
                    const holiday = HOLIDAYS[day]
                    const outside = monthOf(day) !== month
                    return (
                      <span key={day} title={holiday} className={`relative flex flex-col items-center justify-center py-1 text-sm ${outside && !on ? 'text-muted/60' : ''} ${holiday ? 'font-bold' : ''}`}>
                        <span className={isSchool(day) && !on ? 'rounded-sm bg-[var(--safe-bg)] px-1' : 'px-1'}>{Number(day.slice(8))}</span>
                        <span className="flex h-1.5 gap-0.5">
                          {holiday && <span className="size-1.5 rounded-full bg-[var(--careful)]" />}
                          {isRamadan(day) && <span className={`size-1.5 rounded-full ${on ? 'bg-bg' : 'bg-text/50'}`} />}
                        </span>
                      </span>
                    )
                  })}
                </button>
              )
            })}
          </div>

          <ul aria-label={t('picker.legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-muted">
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--careful)]" />{t('picker.holiday')}</li>
            <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-text/50" />{t('picker.ramadan')}</li>
            <li className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-sm bg-[var(--safe-bg)]" />{t('picker.school')}</li>
          </ul>

          <div className="rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm">
            <p className="font-semibold">{t('picker.yourLeave', { weeks: span > 1 ? `${weekLabel(value, lang)} → ${weekLabel(lastPicked, lang)}` : weekLabel(value, lang) })}</p>
            {during.length > 0 && <p className="text-muted">{t('picker.includes', { names: during.map(([, n]) => n).join(', ') })}</p>}
            {ramadanDuring && <p className="text-muted">{t('picker.inRamadan')}</p>}
            {schoolDuring && <p className="text-muted">{t('picker.inSchool')}</p>}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>{t('common.done')}</button>
        </div>
      </Sheet>
    </div>
  )
}
