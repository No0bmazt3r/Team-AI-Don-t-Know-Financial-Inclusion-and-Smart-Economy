// Weeks are ISO weeks (Mon–Sun) in Asia/Kuala_Lumpur, passed around as 'YYYY-MM-DD' Mondays.

const KL = 'Asia/Kuala_Lumpur'

/** Today's date in Malaysia as YYYY-MM-DD, whatever the phone's timezone. */
export function todayKL(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KL }).format(now)
}

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

export function addDays(iso: string, days: number): string {
  const d = utc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weekStart(iso: string): string {
  return addDays(iso, -((utc(iso).getUTCDay() + 6) % 7))
}

/** "13–19 Okt" / "27 Okt – 2 Nov" / "24 Dis" in the rider's language. */
export function rangeLabel(from: string, to: string, lang: 'ms' | 'en'): string {
  const fmt = (iso: string, month: boolean) =>
    new Intl.DateTimeFormat(lang === 'ms' ? 'ms-MY' : 'en-GB', { day: 'numeric', ...(month ? { month: 'short' } : {}), timeZone: 'UTC' }).format(utc(iso))
  if (from === to) return fmt(from, true)
  return from.slice(5, 7) === to.slice(5, 7) ? `${fmt(from, false)}–${fmt(to, true)}` : `${fmt(from, true)} – ${fmt(to, true)}`
}

export const weekLabel = (monday: string, lang: 'ms' | 'en'): string => rangeLabel(monday, addDays(monday, 6), lang)

/** Calendar days from one date to another, both counted. */
export const daysBetween = (from: string, to: string): number => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1

/** This week's Monday in Malaysia. */
export const thisWeekStart = () => weekStart(todayKL())

/** "21 Sep" for a chart axis. */
export function shortDate(iso: string, lang: 'ms' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'ms' ? 'ms-MY' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(iso))
}
