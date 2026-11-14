import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink, Landmark, Link2, OctagonAlert, Phone, ShieldCheck, ShieldQuestion, Sparkles, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { ResultPlaceholder } from '../../components/EmptyState'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useI18n, type Key } from '../../i18n/t'
import { api, errorText } from '../../lib/api'

type Level = 'tinggi' | 'sederhana' | 'rendah'
type Scam = {
  level: Level
  flags: string[]
  extraFlags: string[]
  links: { host: string; official: boolean; lookalikeOf: string | null }[]
  phones: string[]
  usedAi: boolean
}
type Lender = {
  level: Level
  flags: string[]
  extraFlags: string[]
  fca: { matched: boolean; name: string | null; added: string | null; listDate: string; source: string }
  rate: { pct: number | null; period: 'month' | 'year' | null; yearlyPct: number | null; capPct: number; overCap: boolean }
  lenderName: string | null
  usedAi: boolean
}

export const Route = createFileRoute('/_app/semak')({ component: TrustCheck })

const LOOK = {
  tinggi: { Icon: OctagonAlert, cls: 'bg-[var(--risky-bg)] text-[var(--risky)]' },
  sederhana: { Icon: TriangleAlert, cls: 'bg-[var(--careful-bg)] text-[var(--careful)]' },
  rendah: { Icon: ShieldCheck, cls: 'bg-[var(--safe-bg)] text-[var(--safe)]' },
}
const RANK: Level[] = ['rendah', 'sederhana', 'tinggi']
const SEMAK_MULE = 'https://semakmule.rmp.gov.my'
const MIN = 5
const LENDER_MIN = 10 // the lender check needs a little more text to read an offer

// One check for anything pasted: a scam message, a loan offer, or both (a fake lender is often both).
// It runs the message rules and the lender rules + BNM alert list together and shows one answer.
// We never say "this is a scam", and a clean result never says "safe".
function TrustCheck() {
  const { t, lang } = useI18n()
  const [text, setText] = useState('')
  const check = useMutation({
    mutationFn: async () => {
      const [scam, lender] = await Promise.all([
        api<Scam>('/api/scam-check', { body: { text } }),
        text.trim().length >= LENDER_MIN ? api<Lender>('/api/lender-check', { body: { text } }) : Promise.resolve(null),
      ])
      return { scam, lender }
    },
  })
  const r = check.data
  return (
    <>
      <ScreenHeader title={t('check.title')} back />
      <p className="text-muted">{t('check.body')}</p>
      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= MIN) check.mutate() }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={2000} placeholder={t('check.placeholder')} aria-label={t('check.placeholder')} className="rounded-[var(--radius-md)] border border-line-strong bg-surface-2 p-3" />
          <button type="submit" className="btn btn-primary" disabled={text.trim().length < MIN || check.isPending}>{check.isPending ? t('check.checking') : t('check.check')}</button>
          {check.isError && <p role="alert" className="text-sm font-semibold text-[var(--risky)]">{errorText(check.error, lang, t('common.tryAgain'))}</p>}
          <p className="text-[0.8125rem] text-muted">{t('scam.private')}</p>
        </form>
        {!r && <ResultPlaceholder icon={ShieldQuestion} body={t('common.resultHere')} />}
        {r && <Result scam={r.scam} lender={r.lender} />}
      </div>
      <p className="text-[0.8125rem] text-muted">{t('common.disclaimer')}</p>
    </>
  )
}

function Result({ scam, lender }: { scam: Scam; lender: Lender | null }) {
  const { t } = useI18n()
  const level = RANK[Math.max(RANK.indexOf(scam.level), lender ? RANK.indexOf(lender.level) : 0)]!
  const { Icon, cls } = LOOK[level]
  // Lender facts only when the text reads like a loan offer, so a parcel SMS doesn't get "not on BNM's list".
  const loanLike = !!lender && (lender.fca.matched || lender.lenderName !== null || lender.rate.pct !== null || lender.flags.length > 0)
  const ruleFlags = [
    ...scam.flags.map((f) => t(`scam.flag.${f}` as Key)),
    ...(lender?.flags ?? []).map((f) => t(`lender.flag.${f}` as Key, { pct: lender!.rate.yearlyPct ?? '', cap: lender!.rate.capPct })),
  ]
  const aiFlags = [...new Set([...scam.extraFlags, ...(lender?.extraFlags ?? [])])]
  const usedAi = scam.usedAi || !!lender?.usedAi
  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <p className={`flex items-center gap-2 self-start rounded-full px-3 py-1 font-semibold ${cls}`}><Icon size={18} aria-hidden /> {t(`scam.level.${level}` as Key)}</p>

      {loanLike && (
        <div className="flex items-start gap-2 text-sm">
          <Landmark size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
          {lender!.fca.matched
            ? <p className="font-semibold">{t('lender.onList', { name: lender!.fca.name ?? '', date: lender!.fca.listDate, added: lender!.fca.added ?? '' })}</p>
            : <p>{t('lender.notOnList', { date: lender!.fca.listDate })}</p>}
        </div>
      )}

      {ruleFlags.length + aiFlags.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {ruleFlags.map((f) => <li key={f}>{f}</li>)}
          {aiFlags.map((f) => (
            <li key={f} className="marker:text-[#8b5cf6]">
              {f} <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-[0.6875rem] font-bold text-[#7c3aed]"><Sparkles size={10} aria-hidden />{t('ai.noticed')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">{t('scam.none')}</p>
      )}

      {scam.links.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-semibold">{t('scam.links')}</h2>
          {scam.links.map((l) => (
            <p key={l.host} className="flex items-start gap-2 text-sm">
              <Link2 size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
              <span className="min-w-0">
                <b className="break-all">{l.host}</b> · {l.official ? t('scam.linkOfficial') : l.lookalikeOf ? t('scam.linkLookalike', { brand: t(`scam.brand.${l.lookalikeOf}` as Key) }) : t('scam.linkUnknown')}
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <h2 className="text-sm font-semibold">{t('scam.next')}</h2>
        <p className="text-sm">{t('scam.neverShare')}</p>
        {loanLike && <p className="text-sm">{t('lender.kpkt')}</p>}
        <a href={SEMAK_MULE} target="_blank" rel="noopener noreferrer" className="pressable flex items-center gap-3 rounded-[var(--radius-md)] border border-line p-3 text-sm hover:bg-surface-2">
          <ExternalLink size={18} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('scam.mule')}</span>
            <span className="block text-muted">{scam.phones.length ? t('scam.muleNumbers', { numbers: scam.phones.join(', ') }) : t('scam.muleBody')}</span>
          </span>
        </a>
        <a href="tel:997" className="pressable flex items-center gap-3 rounded-[var(--radius-md)] border border-line p-3 text-sm hover:bg-surface-2">
          <Phone size={18} aria-hidden className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{t('scam.nsrc')}</span>
            <span className="block text-muted">{t('scam.nsrcBody')}</span>
          </span>
        </a>
      </div>
      <p className="text-[0.8125rem] text-muted">{t(usedAi ? 'check.usedAi' : 'scam.rulesOnly')}</p>
    </section>
  )
}
