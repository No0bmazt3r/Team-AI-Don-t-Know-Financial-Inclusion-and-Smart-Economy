import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Award, BarChart3, Bell, Briefcase, CalendarClock, ChevronRight, CircleHelp, Download, FileText, Gem, Landmark, Languages, LogOut, Moon, Palmtree, Shield, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Avatar } from '../../components/Avatar'
import { Columns } from '../../components/Columns'
import { GuideButton, GuideHint } from '../../components/Guide'
import { LangToggle } from '../../components/LangToggle'
import { MoneyField } from '../../components/MoneyField'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Sheet } from '../../components/Sheet'
import { useI18n, type Key } from '../../i18n/t'
import { api, clearOfflineData, errorText, meQuery, type Platform, post, type User } from '../../lib/api'
import { applyAppearance } from '../../lib/appearance'
import { deviceEndpoint, disablePush, enablePush, pushSupported, type PushState } from '../../lib/push'
import { HoursField } from '../../components/HoursField'
import { PlatformPicker } from '../../components/PlatformPicker'
import { Select } from '../../components/Select'
import { Chip, PRIVACY_VERSION, cityOptions } from '../onboarding'

export const Route = createFileRoute('/_app/settings')({ component: Settings })

const ROW = 'flex min-h-14 items-center gap-3 px-4 py-3'
const THEMES: User['theme'][] = ['light', 'dark', 'system']
const DAYS: Key[] = ['day.0', 'day.1', 'day.2', 'day.3', 'day.4', 'day.5', 'day.6']

function NavRow({ to, icon, label, tour }: { to: '/pencapaian' | '/rekod' | '/bil' | '/cuti' | '/privacy' | '/pocket' | '/pricing' | '/admin'; icon: ReactNode; label: string; tour?: string }) {
  return (
    <Link to={to} data-tour={tour} className={`${ROW} pressable hover:bg-surface-2`}>
      {icon}
      <span className="flex-1 font-semibold">{label}</span>
      <ChevronRight size={20} className="text-muted" aria-hidden />
    </Link>
  )
}

// Profil: language, theme, work profile, bills, privacy, export, delete.
function Settings() {
  const { t, lang } = useI18n()
  const { data: user } = useQuery(meQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // "Tunjuk semula panduan": the first-visit hint cards come back on every screen
  const replay = useMutation({
    mutationFn: () => api<{ user: User }>('/api/tips', { method: 'DELETE' }),
    onSuccess: ({ user: u }) => queryClient.setQueryData(meQuery.queryKey, u),
  })
  const update = useMutation({
    mutationFn: (body: Partial<User> & { platforms?: Platform[] }) => api<{ user: User }>('/api/me', { method: 'PATCH', body }),
    onSuccess: ({ user: u }) => {
      queryClient.setQueryData(meQuery.queryKey, u)
      applyAppearance(u.theme, u.accent)
      queryClient.invalidateQueries({ queryKey: ['home'] })
    },
  })
  const consent = useMutation({
    mutationFn: (c: { kind: 'llm_processing' | 'indeks_rider'; granted: boolean }) => api<{ user: User }>('/api/consents', { body: { ...c, version: PRIVACY_VERSION } }),
    onSuccess: ({ user: u }) => queryClient.setQueryData(meQuery.queryKey, u),
  })
  const logout = useMutation({
    mutationFn: async () => {
      await disablePush().catch(() => {}) // a shared phone shouldn't keep reminding the rider who left
      await post('/api/auth/logout')
    },
    onSettled: async () => {
      clearOfflineData()
      queryClient.clear()
      queryClient.setQueryData(meQuery.queryKey, null)
      await navigate({ to: '/login' })
    },
  })
  if (!user) return null
  const ai = user.consents.llm_processing?.granted !== false
  const indeks = user.consents.indeks_rider?.granted === true

  return (
    <>
      <ScreenHeader title={t('settings.title')} action={<GuideButton screen="profil" />} />
      <GuideHint screen="profil" />
      <Columns>
      <div className="col">
      <section className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-4 py-6 text-center">
        <Avatar user={user} className="size-20 text-3xl ring-4 ring-brand" />
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight">{user.displayName}</p>
          <p className="truncate text-sm text-muted">{user.isDemo ? t('settings.demoAccount') : user.email}</p>
        </div>
      </section>

      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        <NavRow to="/pencapaian" icon={<Award size={22} aria-hidden />} label={t('ach.title')} />
        <NavRow to="/rekod" tour="records" icon={<FileText size={22} aria-hidden />} label={t('rekod.title')} />
        <NavRow to="/bil" icon={<CalendarClock size={22} aria-hidden />} label={t('bills.title')} />
        <NavRow to="/cuti" icon={<Palmtree size={22} aria-hidden />} label={t('cuti.entryTitle')} />
        <NavRow to="/pocket" icon={<Landmark size={22} aria-hidden />} label={t('settings.pocket')} />
        <NavRow to="/pricing" icon={<Gem size={22} aria-hidden />} label={t('settings.pricing')} />
        <button type="button" data-tour="work" onClick={() => setProfileOpen(true)} className={`${ROW} pressable text-left hover:bg-surface-2`}>
          <Briefcase size={22} aria-hidden />
          <span className="flex-1 font-semibold">{t('settings.work')}</span>
          <ChevronRight size={20} className="text-muted" aria-hidden />
        </button>
      </div>

      </div>
      <div className="col">
      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        <div className={ROW}>
          <Languages size={22} aria-hidden />
          <span className="flex-1 font-semibold">{t('lang.label')}</span>
          <LangToggle />
        </div>
        <div className="flex flex-col gap-2 px-4 py-3">
          <span className="flex items-center gap-3 font-semibold"><Moon size={22} aria-hidden /> {t('settings.theme')}</span>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('settings.theme')}>
            {THEMES.map((th) => (
              <Chip key={th} on={user.theme === th} onClick={() => update.mutate({ theme: th })}>{t(`theme.${th}` as Key)}</Chip>
            ))}
          </div>
        </div>
        <PaydayReminder user={user} />
        <button type="button" onClick={() => replay.mutate()} disabled={replay.isPending} className={`${ROW} pressable text-left hover:bg-surface-2`}>
          <CircleHelp size={22} aria-hidden />
          <span className="flex-1">
            <span className="block font-semibold">{t('settings.replayGuides')}</span>
            {replay.isSuccess && <span role="status" className="block text-[0.8125rem] text-muted">{t('settings.replayGuidesDone')}</span>}
          </span>
        </button>
      </div>

      <section aria-labelledby="privacy" data-tour="privacy" className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        <h2 id="privacy" className={`${ROW} font-semibold`}><Shield size={22} aria-hidden /> {t('settings.privacy')}</h2>
        <Toggle label={t('settings.ai')} hint={t('settings.aiHint')} on={ai} onChange={(v) => consent.mutate({ kind: 'llm_processing', granted: v })} />
        <Toggle label={t('settings.indeks')} hint={t('settings.indeksHint')} on={indeks} onChange={(v) => consent.mutate({ kind: 'indeks_rider', granted: v })} />
        <NavRow to="/privacy" icon={<FileText size={22} aria-hidden />} label={t('privacy.title')} />
        <a href="/api/me/export" className={`${ROW} pressable hover:bg-surface-2`}>
          <Download size={22} aria-hidden />
          <span className="flex-1 font-semibold">{t('settings.export')}</span>
        </a>
        <button type="button" onClick={() => setDeleteOpen(true)} className={`${ROW} pressable text-left font-semibold text-[var(--risky)] hover:bg-surface-2`}>
          <Trash2 size={22} aria-hidden /> {t('settings.delete')}
        </button>
      </section>

      {user.isAdmin && (
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <NavRow to="/admin" icon={<BarChart3 size={22} aria-hidden />} label={t('settings.admin')} />
        </div>
      )}

      <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending} className={`${ROW} pressable justify-center rounded-lg border border-line bg-surface font-semibold text-[var(--risky)] hover:bg-surface-2 disabled:opacity-50`}>
        <LogOut size={20} aria-hidden />
        {t('settings.logout')}
      </button>
      {update.isError && <p role="alert" className="text-sm text-[var(--risky)]">{errorText(update.error, lang, t('common.tryAgain'))}</p>}
      </div>
      </Columns>

      <Sheet open={profileOpen} onClose={() => setProfileOpen(false)} title={t('settings.work')}>
        <WorkProfile user={user} onSave={(body) => update.mutate(body, { onSuccess: () => setProfileOpen(false) })} saving={update.isPending} />
      </Sheet>
      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('settings.delete')}>
        <DeleteAccount />
      </Sheet>
    </>
  )
}

// The payday reminder on this device. On means this browser's subscription is stored for this rider.
function PaydayReminder({ user }: { user: User }) {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const server = useQuery({ queryKey: ['push'], queryFn: () => api<PushState>('/api/push') })
  const device = useQuery({ queryKey: ['push', 'device'], queryFn: deviceEndpoint })
  const on = Boolean(device.data && server.data?.endpoints.includes(device.data))
  const toggle = useMutation({
    mutationFn: (v: boolean) => (v ? enablePush(server.data!.publicKey!) : disablePush()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['push'] }),
  })
  const test = useMutation({ mutationFn: () => api<{ sent: number }>('/api/push/test', { method: 'POST' }) })
  const day = t(DAYS[user.paydayWeekday ?? 0]!)
  const hint = !pushSupported() ? t('remind.unsupported') : server.data && !server.data.publicKey ? t('remind.notSetUp') : t('remind.hint', { day })
  const failed = toggle.error instanceof Error && toggle.error.message === 'denied' ? t('remind.denied') : toggle.isError ? errorText(toggle.error, lang, t('remind.unsupported')) : null
  return (
    <div className="flex flex-col gap-2 py-1">
      <Toggle icon={<Bell size={22} aria-hidden />} label={t('remind.title')} hint={hint} on={on} disabled={!pushSupported() || !server.data?.publicKey || toggle.isPending} onChange={(v) => toggle.mutate(v)} />
      {on && (
        <button type="button" className="mx-4 mb-2 self-start text-sm font-semibold underline" onClick={() => test.mutate()} disabled={test.isPending}>
          {test.isSuccess ? t('remind.sent') : t('remind.test')}
        </button>
      )}
      {failed && <p role="alert" className="mx-4 mb-2 text-sm text-[var(--risky)]">{failed}</p>}
    </div>
  )
}

function Toggle({ icon, label, hint, on, disabled, onChange }: { icon?: ReactNode; label: string; hint: string; on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-start gap-3 px-4 py-3 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-6 shrink-0 accent-[var(--brand-text)]" />
    </label>
  )
}

function WorkProfile({ user, onSave, saving }: { user: User; onSave: (body: Partial<User> & { platforms?: Platform[] }) => void; saving: boolean }) {
  const { t } = useI18n()
  const [platforms, setPlatforms] = useState<Platform[]>(user.platforms)
  const [city, setCity] = useState(user.city ?? '')
  const [hours, setHours] = useState(user.defaultHours ?? 45)
  const [payday, setPayday] = useState(user.paydayWeekday ?? 0)
  const [essentials, setEssentials] = useState<number | null>(user.essentialsWeekSen)
  const [sick, setSick] = useState(user.sickDaysCovered)
  return (
    <form className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto" onSubmit={(e) => { e.preventDefault(); onSave({ platforms, city: city || null, defaultHours: hours, paydayWeekday: payday, essentialsWeekSen: essentials, sickDaysCovered: sick }) }}>
      <PlatformPicker value={platforms} onChange={setPlatforms} />
      <Select label={t('onb.city')} value={city} onChange={setCity} options={cityOptions(t('onb.cityOther'))} />
      <HoursField label={t('onb.hoursLabel')} value={hours} onChange={setHours} />
      {hours > 60 && <p className="rounded-[var(--radius-sm)] bg-[var(--careful-bg)] p-3 text-sm text-[var(--careful)]">{t('onb.fatigue')}</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('onb.payday')}>
        {DAYS.map((d, i) => <Chip key={d} on={payday === i} onClick={() => setPayday(i)}>{t(d)}</Chip>)}
      </div>
      <MoneyField label={t('onb.essentialsLabel')} valueSen={essentials} onChange={setEssentials} />
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('settings.sickDays')}
        <input type="number" inputMode="numeric" min={0} max={14} value={sick} onChange={(e) => setSick(Math.min(14, Math.max(0, Number(e.target.value) || 0)))} className="h-12 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 text-base font-normal tabular-nums" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={saving || platforms.length === 0}>{t('common.save')}</button>
    </form>
  )
}

function DeleteAccount() {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [word, setWord] = useState('')
  const remove = useMutation({
    mutationFn: () => api('/api/me', { method: 'DELETE', body: { confirm: word } }),
    onSuccess: async () => {
      clearOfflineData()
      queryClient.clear()
      queryClient.setQueryData(meQuery.queryKey, null)
      await navigate({ to: '/login' })
    },
  })
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (word === 'PADAM') remove.mutate() }}>
      <p>{t('settings.deleteBody')}</p>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('settings.deleteType')}
        <input value={word} onChange={(e) => setWord(e.target.value.toUpperCase())} autoCapitalize="characters" className="h-12 rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 text-base font-normal" />
      </label>
      {remove.isError && <p className="text-sm text-[var(--risky)]">{errorText(remove.error, lang, t('common.tryAgain'))}</p>}
      <button type="submit" className="btn bg-[var(--risky)] text-white" disabled={word !== 'PADAM' || remove.isPending}>{t('settings.deleteConfirm')}</button>
    </form>
  )
}
