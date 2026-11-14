import {
  Award,
  BarChart3,
  Calculator,
  CalendarClock,
  Camera,
  FileText,
  Landmark,
  MessageCircle,
  ShieldAlert,
  Palmtree,
  PiggyBank,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Avatar } from './Avatar'
import { Tooltip } from './Tooltip'
import { Logo } from './Logo'
import { useI18n, type Key } from '../i18n/t'
import { meQuery } from '../lib/api'

type To = '/' | '/tabung' | '/tanya' | '/rekod' | '/bil' | '/cuti' | '/pocket' | '/layak' | '/semak' | '/pencapaian' | '/admin'

const MAIN: [To, Key, LucideIcon][] = [
  ['/', 'nav.gaji', Wallet],
  ['/tabung', 'nav.tabung', PiggyBank],
  ['/tanya', 'nav.tanya', MessageCircle],
]
const MORE: [To, Key, LucideIcon][] = [
  ['/rekod', 'rekod.title', FileText],
  ['/bil', 'bills.title', CalendarClock],
  ['/cuti', 'cuti.title', Palmtree],
  ['/pocket', 'settings.pocket', Landmark],
  ['/layak', 'layak.title', Calculator],
  ['/semak', 'check.title', ShieldAlert],
  ['/pencapaian', 'ach.title', Award],
]

// Desktop (lg+) replaces the bottom nav with this sidebar, which also lists the screens the phone reaches from inside pages.
export function SideNav() {
  const { t } = useI18n()
  const { data: user } = useQuery(meQuery)
  const more = user?.isAdmin ? [...MORE, ['/admin', 'settings.admin', BarChart3] as [To, Key, LucideIcon]] : MORE
  // Each item's tooltip says what the page is for (the label is already visible)
  const item = ([to, label, Icon]: [To, Key, LucideIcon]) => (
    <li key={to}>
      <Tooltip describes text={t(`tip.${to === '/' ? 'gaji' : to.slice(1)}` as Key)}>
      <Link
        to={to}
        activeOptions={{ exact: to === '/' }}
        className="pressable flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 font-medium text-muted hover:bg-surface-2 hover:text-text data-[status=active]:bg-surface-2 data-[status=active]:font-bold data-[status=active]:text-text"
      >
        <Icon size={20} aria-hidden />
        {t(label)}
      </Link>
      </Tooltip>
    </li>
  )
  const group = (heading: Key, items: [To, Key, LucideIcon][]) => (
    <div className="flex flex-col gap-1">
      <h2 className="px-3 text-[0.75rem] font-semibold tracking-wide text-muted uppercase">{t(heading)}</h2>
      <ul className="flex flex-col gap-1">{items.map(item)}</ul>
    </div>
  )
  return (
    <nav aria-label={t('nav.label')} className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-6 border-r border-line bg-surface px-3 py-5 lg:flex">
      <Link to="/" className="flex items-center gap-2 px-3">
        <Logo className="h-9 w-auto" />
        <span className="text-xl font-extrabold tracking-tight">Coinvoy</span>
      </Link>
      <Tooltip describes text={t('tip.snap')}>
        <Link to="/snap" data-tour="snap-nav" className="btn btn-brand">
          <Camera size={20} aria-hidden />
          {t('snap.title')}
        </Link>
      </Tooltip>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {group('nav.main', MAIN)}
        {group('nav.more', more)}
      </div>
      {user && (
        <Tooltip describes text={t('tip.settings')}>
        <Link
          to="/settings"
          className="pressable flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border border-line px-3 hover:bg-surface-2 data-[status=active]:border-text"
        >
          <Avatar user={user} className="size-8 text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{user.displayName}</span>
            <span className="block text-[0.8125rem] text-muted">{t('nav.profil')}</span>
          </span>
        </Link>
        </Tooltip>
      )}
    </nav>
  )
}
