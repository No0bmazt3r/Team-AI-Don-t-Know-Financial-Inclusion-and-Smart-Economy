import { Link } from '@tanstack/react-router'
import { useI18n } from '../i18n/t'

// The two admin screens: usage numbers and the AI keys. Links (not buttons), so each has its own address.
export function AdminTabs() {
  const { t } = useI18n()
  const tab = 'pressable flex h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] text-sm font-semibold text-muted hover:text-text'
  return (
    <nav aria-label={t('admin.tabs')} className="flex gap-1 rounded-[var(--radius-md)] bg-surface-2 p-1">
      <Link to="/admin" activeOptions={{ exact: true }} className={tab} activeProps={{ className: 'bg-surface text-text shadow-sm', 'aria-current': 'page' }}>
        {t('admin.title')}
      </Link>
      <Link to="/admin/ai" className={tab} activeProps={{ className: 'bg-surface text-text shadow-sm', 'aria-current': 'page' }}>
        {t('ai.tab')}
      </Link>
    </nav>
  )
}
