import { type QueryClient, queryOptions } from '@tanstack/react-query'

export type Platform = 'grab' | 'foodpanda' | 'shopeefood' | 'lalamove' | 'other'
export const PLATFORMS: Platform[] = ['grab', 'foodpanda', 'shopeefood', 'lalamove', 'other']

// Each app's logo on its own colour, so riders spot theirs quickly. Logo sources are in public/platforms/README.md.
export const MARK: Record<Platform, { bg: string; src?: string }> = {
  grab: { bg: '#00B14F', src: '/platforms/grab.svg' },
  foodpanda: { bg: '#D70F64', src: '/platforms/foodpanda.svg' },
  shopeefood: { bg: '#EE4D2D', src: '/platforms/shopeefood.svg' },
  lalamove: { bg: '#F16622', src: '/platforms/lalamove.png' },
  other: { bg: 'var(--border-strong)' },
}

export type Risk = 'selamat' | 'berhati' | 'berisiko'
export type Accent = 'lime' | 'aqua' | 'amber' | 'pink' | 'sky'

export type User = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  isDemo: boolean
  lang: 'ms' | 'en'
  theme: 'system' | 'light' | 'dark'
  city: string | null
  paydayWeekday: number | null
  defaultHours: number | null
  essentialsWeekSen: number | null
  pocketReady: boolean
  seenTips: string[]
  sickDaysCovered: number
  accent: Accent
  platforms: Platform[]
  onboarded: boolean
  isAdmin: boolean
  consents: Partial<Record<'privacy' | 'llm_processing' | 'indeks_rider', { granted: boolean; version: string }>>
}

export type Factor = { key: 'first' | 'bills' | 'leave' | 'buffer' | 'forecast' | 'steady' | 'mixed'; deltaSen?: number; names?: string[] }

export type Salary = {
  weekStart: string
  salarySen: number
  pSafe: number
  risk: Risk
  factors: Factor[]
  band: { low: number; mid: number; high: number }
  buildUp: { targetSen: number; bufferSen: number; per100Sen: number } | null
  jurang: { essentialsSen: number; gapSen: number } | null
  coldStart: boolean
  weeksUsed: number
  plannedHours: number | null
  fromCutiSen: number
  billsThisWeekSen: number
  salaryDeltaSen: number | null
}

export type Transfer = {
  id: number
  weekStart: string
  direction: 'in' | 'out'
  amountSen: number
  allocation: Record<string, number>
  status: 'pending' | 'confirmed' | 'partial' | 'skipped'
  confirmedAmountSen: number | null
  confirmedAt: string | null
  verification: 'self' | 'checked'
}

export type Pot = { kind: string; name: string | null; icon: string | null; active: boolean; balanceSen: number; targetSen: number; weeklySen: number }
export type PotSuggestion = { kind: string; targetSen: number; weeklySen: number; weeks: number; reason: string }

export type Streak = {
  weeks: number
  atRisk: boolean
  frozenThisWeek: boolean
  level: number
  nextLevelAt: number | null
  accents: Accent[]
  transfersConfirmed: number
  gajiKept: number
  freezesLeft: number
  badges?: { kind: string; at: string }[]
}

export type Home = {
  salary: Salary | null
  transfer: Transfer | null
  buffer: Pot
  lastLoggedWeek: string | null
  needsSnap: boolean
  weeksLogged: number
  checkinDue: string | null
  streak: Streak
}

export type Leave = { id: number; kind: 'planned' | 'sick'; label: string | null; startWeek: string; weeks: number; days: number | null; setAsideWeekSen: number; status: string }
export type LeavePreview = { weeksUntil: number; setAsideWeekSen: number; salarySen: number; salaryDeltaSen: number; pSafe: number; risk: Risk }
export type Caruman = {
  isaraan: { rate: number; capSen: number; paidYearSen: number; matchYearSen: number; fullMatchNeedsSen: number; leftForFullMatchSen: number; weeklySen: number }
  perkeso: { deductedAtSource: boolean; rate: number }
  governmentClaimedSen: number
}
export type Week = { weekStart: string; netSen: number; hours: number | null; verification: 'self' | 'checked'; platforms: (Draft & { id: number; netSen: number; verification: string })[] }
export type Penyata = {
  weeksLogged: number
  unlockAt: number
  unlocked: boolean
  summary: { avgSen: number; minSen: number; maxSen: number; weeks: number; trend: 'up' | 'down' | 'flat'; source: 'self' | 'checked' | 'verified' } | null
}
export type Message = { id?: number; role: 'user' | 'assistant'; content: string; risk: Risk | null; guardTriggered?: boolean; at: string }
export type Lesson = { topic: string; title: string; text: string }
export type Expense = { id: number; weekStart: string; amountSen: number; category: string; note: string | null; parseTier: string | null }

export type Draft = {
  weekStart: string
  platform: Platform
  grossSen: number
  commissionSen: number
  incentivesSen: number
  tipsSen: number
  trips: number | null
  hoursOnline: number | null
  confidence?: 'high' | 'medium' | 'low'
  warnings?: string[]
  injectionSuspected?: boolean
}

export type Bill = {
  id: number
  name: string
  amountSen: number
  frequency: 'weekly' | 'monthly' | 'yearly' | 'once'
  dueDay: number | null
  dueDate: string | null
  active: boolean
}

/** Errors arrive as { error: { code, message_ms, message_en } }. */
export class ApiError extends Error {
  status: number
  code: string
  messageMs: string
  messageEn: string
  constructor(status: number, code: string, messageMs: string, messageEn: string) {
    super(messageEn)
    this.status = status
    this.code = code
    this.messageMs = messageMs
    this.messageEn = messageEn
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body || init.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(res.status, e?.code ?? 'network', e?.message_ms ?? 'Tak dapat sambung. Cuba lagi.', e?.message_en ?? "Couldn't connect. Try again.")
  }
  return data as T
}

export function errorText(error: unknown, lang: 'ms' | 'en', fallback: string): string {
  return error instanceof ApiError ? (lang === 'ms' ? error.messageMs : error.messageEn) : fallback
}

// Who am I: 401 means signed out (null), anything else unexpected is an error.
export const meQuery = queryOptions({
  queryKey: ['me'],
  staleTime: 5 * 60 * 1000,
  queryFn: async (): Promise<User | null> => {
    try {
      return (await api<{ user: User }>('/api/auth/me')).user
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null
      throw e
    }
  },
})

export const homeQuery = queryOptions({ queryKey: ['home'], queryFn: () => api<Home>('/api/home') })
export const potsQuery = queryOptions({ queryKey: ['pots'], queryFn: async () => (await api<{ pots: Pot[] }>('/api/pots')).pots })
// Under ['pots'], so confirming a transfer refreshes it too
export const penampanHistoryQuery = queryOptions({ queryKey: ['pots', 'penampan-history'], queryFn: async () => (await api<{ points: { weekStart: string; balanceSen: number }[] }>('/api/pots/penampan/history')).points })
export const streakQuery = queryOptions({ queryKey: ['streak'], queryFn: () => api<Streak>('/api/streak') })
export const leaveQuery = queryOptions({ queryKey: ['leave'], queryFn: () => api<{ leave: Leave[]; sick: { daysCovered: number; daysUsed: number } }>('/api/leave') })
export const carumanQuery = queryOptions({ queryKey: ['caruman'], queryFn: () => api<Caruman>('/api/caruman') })
export const weeksQuery = queryOptions({ queryKey: ['weeks'], queryFn: async () => (await api<{ weeks: Week[] }>('/api/weeks')).weeks })
export const penyataQuery = queryOptions({ queryKey: ['penyata'], queryFn: () => api<Penyata>('/api/penyata') })
export const messagesQuery = queryOptions({ queryKey: ['messages'], queryFn: async () => (await api<{ messages: Message[] }>('/api/tanya/messages')).messages })
export const celikQuery = queryOptions({ queryKey: ['celik'], queryFn: async () => (await api<{ lessons: Lesson[] }>('/api/celik')).lessons })
export const expensesQuery = (week: string) => queryOptions({ queryKey: ['expenses', week], queryFn: async () => (await api<{ expenses: Expense[] }>(`/api/expenses?week=${week}`)).expenses })
export const metaQuery = queryOptions({ queryKey: ['meta'], staleTime: Infinity, queryFn: () => api<{ llmEnabled: boolean; llmProvider: string | null; llmRegion: string | null; noticeVersion: string; googleEnabled: boolean; privacyContact: string | null }>('/api/meta') })
export const billsQuery = queryOptions({ queryKey: ['bills'], queryFn: async () => (await api<{ bills: Bill[] }>('/api/bills')).bills })

/** Drop the offline copy of personal data (sign-out, account deletion). */
export const clearOfflineData = () => navigator.serviceWorker?.controller?.postMessage('clear-data')

export async function post(path: string): Promise<void> {
  await api(path, { method: 'POST' })
}

/** Starts loading a screen's data before it opens, without making the screen wait for it. */
export const prefetch =
  (...queries: { queryKey: readonly unknown[] }[]) =>
  ({ context }: { context: { queryClient: QueryClient } }) => {
    for (const q of queries) void context.queryClient.prefetchQuery(q as Parameters<QueryClient['prefetchQuery']>[0])
  }
