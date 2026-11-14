// The number guard: every number in a Tanya reply must come from a tool result or the rider's
// own message. Coinvoy's main AI-safety claim, so it is plain code, not a prompt.
//
// Numbers compare as values: "RM1,234.50", "1.2k", "52 peratus" and BM number words ("empat puluh") all normalise.
// A reply may round a tool value to the precision it writes (RM617.40 → "RM617"). Small counts followed by a unit
// word ("3 pilihan", "2 minggu") are structure, not money, and are allowed.
import { NUMBER_WORDS, wordsToNumber } from '../lib/bmNumbers.ts'

const COUNT_UNITS = new Set([
  'minggu', 'hari', 'pilihan', 'langkah', 'bulan', 'jam', 'kali', 'tahun', 'week', 'weeks', 'day', 'days',
  'option', 'options', 'step', 'steps', 'month', 'months', 'hour', 'hours', 'times', 'year', 'years',
])
const NUM = /(?<![\w.])(?:rm\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k\b|%|peratus|percent)?/gi

type Found = { value: number; decimals: number; after: string }

export function extract(text: string): Found[] {
  const found: Found[] = []
  for (const m of text.matchAll(NUM)) {
    const whole = m[1]!.replace(/,/g, '')
    const frac = m[2] ?? ''
    let value = Number(frac ? `${whole}.${frac}` : whole)
    let decimals = frac.length
    if (m[3]?.toLowerCase() === 'k') [value, decimals] = [value * 1000, 0]
    const end = m.index + m[0].length
    found.push({ value, decimals, after: text.slice(end, end + 12).toLowerCase() })
  }
  const words: string[] = text.toLowerCase().match(/[a-z]+/g) ?? []
  let run: string[] = []
  words.concat(['.']).forEach((w, i) => {
    if (NUMBER_WORDS.has(w)) return void run.push(w)
    if (run.length) {
      const n = wordsToNumber(run)
      if (n !== null) found.push({ value: n, decimals: 0, after: words.slice(i, i + 2).join(' ') })
      run = []
    }
  })
  return found
}

// A number typed with odd commas ("250,00000") has two readings: the one extract() takes (250,000) and the digits
// without commas (25,000,000). Both are allowed, so Odah can ask the rider which one they meant.
const loose = (t: string) => [...t.matchAll(/\d+(?:,\d+)+/g)].map((m) => Number(m[0].replace(/,/g, '')))
export const allowedValues = (...texts: string[]): Set<number> => new Set(texts.flatMap((t) => [...extract(t).map((f) => f.value), ...loose(t)]))

function matches(value: number, decimals: number, allowed: Set<number>): boolean {
  const tol = 0.5 * 10 ** -decimals + 1e-9 // the reply may round to the precision it shows
  for (const a of allowed) {
    if (Math.abs(value - a) <= tol) return true
    if (a > 0 && a <= 1 && Math.abs(value - a * 100) <= tol) return true // p_safe 0.953 written as 95%
  }
  return false
}

/** The numbers in reply that nothing supports. Empty = the reply passes. */
export function check(reply: string, allowed: Set<number>): number[] {
  const bad: number[] = []
  for (const { value, decimals, after } of extract(reply)) {
    const unit = after.split(' ')[0]!.replace(/[.,)]+$/, '')
    if (value <= 12 && Number.isInteger(value) && COUNT_UNITS.has(unit)) continue // "3 pilihan": a count, not money
    if (!matches(value, decimals, allowed)) bad.push(value)
  }
  return bad
}
