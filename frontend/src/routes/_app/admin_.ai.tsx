import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Clock, Eye, EyeOff, KeyRound, Loader2, Plus, Trash2, XCircle } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { AdminTabs } from '../../components/AdminTabs'
import { ErrorState } from '../../components/ErrorState'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Select } from '../../components/Select'
import { Sheet } from '../../components/Sheet'
import { Skeleton } from '../../components/Skeleton'
import { useI18n } from '../../i18n/t'
import { api, errorText } from '../../lib/api'

export const Route = createFileRoute('/_app/admin_/ai')({ component: AiKeys })

type Status = 'ok' | 'cooling' | 'failing'
type Connection = {
  id: number
  name: string
  baseUrl: string
  keyLast4: string
  providerName: string
  regionNote: string
  status: Status
  coolingUntil: string | null
  decryptable: boolean
  lastError: string | null
  lastErrorAt: string | null
  callsToday: number
  calls7d: number
  lastSuccessAt: string | null
}
type Step = { connectionId: number; model: string; reasoning: string | null }
type Job = 'snap' | 'tanya' | 'lender' | 'bm' | 'reco'
type State = { masterKeySet: boolean; connections: Connection[]; jobs: Record<Job, Step[]>; audit: { actorEmail: string; action: 'connection.add' | 'connection.edit' | 'connection.delete' | 'job.set'; detail: string; at: string }[] }
type TestResult = { ok: boolean; error: string | null; checked: 'chat' | 'models' }

const JOBS: Job[] = ['snap', 'tanya', 'lender', 'bm', 'reco']
const KEY = ['admin', 'ai']

// Known OpenAI-compatible providers: picking one fills the address so it can't be mistyped
const PRESETS = [
  { id: 'groq', name: 'Groq', url: 'https://api.groq.com/openai/v1', region: 'Processed in the United States by Groq.' },
  { id: 'gemini', name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', region: 'Processed by Google; on the free tier Google may use the data to improve its products.' },
  { id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', region: 'Routed by OpenRouter to the model provider you pick.' },
  { id: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1', region: 'Processed in the United States by OpenAI.' },
  { id: 'cerebras', name: 'Cerebras', url: 'https://api.cerebras.ai/v1', region: 'Processed in the United States by Cerebras.' },
  { id: 'mistral', name: 'Mistral', url: 'https://api.mistral.ai/v1', region: 'Processed in the EU by Mistral.' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://api.deepseek.com/v1', region: 'Processed in China by DeepSeek.' },
  { id: 'custom', name: '', url: '', region: '' },
] as const

const inputCls = 'h-12 w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface-2 px-3 text-base'
const card = 'flex flex-col gap-3 rounded-lg border border-line bg-surface p-4'

function AiKeys() {
  const { t } = useI18n()
  const q = useQuery({ queryKey: KEY, queryFn: () => api<State>('/api/admin/ai') })
  const [editing, setEditing] = useState<Connection | 'new' | null>(null)
  if (q.isPending) return <Skeleton className="h-80" />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const { masterKeySet, connections, jobs, audit } = q.data
  return (
    <>
      <ScreenHeader title={t('ai.title')} back />
      <AdminTabs />
      {!masterKeySet && (
        <p role="alert" className="flex gap-2 rounded-[var(--radius-md)] bg-[var(--careful-bg)] p-3 text-sm text-[var(--careful)]">
          <AlertTriangle size={20} aria-hidden className="shrink-0" />
          <span>{t('ai.noMasterKey')}</span>
        </p>
      )}
      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <section aria-labelledby="ai-conns" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 id="ai-conns" className="flex-1 text-lg font-bold">{t('ai.connections')}</h2>
            <button type="button" disabled={!masterKeySet} onClick={() => setEditing('new')} className="btn btn-primary w-auto">
              <Plus size={18} aria-hidden /> {t('ai.add')}
            </button>
          </div>
          {connections.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-muted">{t('ai.noConnections')}</p>
          ) : (
            connections.map((c) => <ConnectionCard key={c.id} c={c} onEdit={() => setEditing(c)} />)
          )}
        </section>
        <section aria-labelledby="ai-jobs" className="flex flex-col gap-3">
          <h2 id="ai-jobs" className="text-lg font-bold">{t('ai.jobs')}</h2>
          <p className="text-sm text-muted">{t('ai.jobsHelp')}</p>
          {JOBS.map((j) => <JobCard key={`${j}:${JSON.stringify(jobs[j])}`} job={j} steps={jobs[j]} connections={connections} />)}
        </section>
      </div>
      <details className={card}>
        <summary className="pressable -m-1 cursor-pointer rounded p-1 font-semibold">{t('ai.audit', { n: audit.length })}</summary>
        {audit.length === 0 ? (
          <p className="text-sm text-muted">{t('ai.auditNone')}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line text-sm">
            {audit.map((a, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2">
                <span className="text-muted tabular-nums"><When at={a.at} /> · {a.actorEmail}</span>
                <span><b>{t(`ai.action.${a.action}`)}</b> {a.detail}</span>
              </li>
            ))}
          </ol>
        )}
      </details>
      <ConnectionSheet editing={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function When({ at }: { at: string }) {
  const { lang } = useI18n()
  const d = new Date(at)
  return <time dateTime={at}>{d.toLocaleString(lang === 'ms' ? 'ms-MY' : 'en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
}

const TONE = {
  safe: 'bg-[var(--safe-bg)] text-[var(--safe)]',
  careful: 'bg-[var(--careful-bg)] text-[var(--careful)]',
  risky: 'bg-[var(--risky-bg)] text-[var(--risky)]',
} as const

// Status in words and an icon, never colour alone
function StatusPill({ c }: { c: Connection }) {
  const { t, lang } = useI18n()
  const [Icon, tone, text] = !c.decryptable
    ? [KeyRound, TONE.risky, t('ai.undecryptable')]
    : c.status === 'failing'
      ? [XCircle, TONE.risky, t('ai.failing')]
      : c.status === 'cooling'
        ? [Clock, TONE.careful, t('ai.cooling', { time: new Date(c.coolingUntil!).toLocaleTimeString(lang === 'ms' ? 'ms-MY' : 'en-MY', { hour: '2-digit', minute: '2-digit' }) })]
        : [CheckCircle2, TONE.safe, t('ai.ok')]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <Icon size={14} aria-hidden /> {text}
    </span>
  )
}

function ConnectionCard({ c, onEdit }: { c: Connection; onEdit: () => void }) {
  const { t, lang } = useI18n()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const test = useMutation({ mutationFn: () => api<TestResult>(`/api/admin/ai/connections/${c.id}/test`, { method: 'POST' }), onSettled: () => qc.invalidateQueries({ queryKey: KEY }) })
  const remove = useMutation({ mutationFn: () => api(`/api/admin/ai/connections/${c.id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) })
  return (
    <article className={card} aria-label={c.name}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold">{c.name}</h3>
        <StatusPill c={c} />
      </div>
      <p className="text-sm text-muted">
        {c.providerName} · {new URL(c.baseUrl).host} · <span className="font-mono">…{c.keyLast4}</span>
      </p>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Stat label={t('ai.today')} value={c.callsToday} />
        <Stat label={t('ai.week')} value={c.calls7d} />
        <Stat label={t('ai.lastOk')} value={c.lastSuccessAt ? <When at={c.lastSuccessAt} /> : '–'} />
      </dl>
      {c.lastError && c.lastErrorAt && (
        <p className="flex gap-2 rounded-[var(--radius-sm)] bg-surface-2 p-2 text-sm">
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--careful)]" />
          <span className="min-w-0 break-words">
            <span className="text-muted">{t('ai.lastError')} <When at={c.lastErrorAt} />: </span>
            {c.lastError}
          </span>
        </p>
      )}
      <TestStatus pending={test.isPending} result={test.data} error={test.error ? errorText(test.error, lang, t('ai.error')) : null} />
      <div className="flex gap-2">
        <button type="button" onClick={() => test.mutate()} disabled={test.isPending} className="btn btn-secondary flex-1">{t('ai.test')}</button>
        <button type="button" onClick={onEdit} className="btn btn-secondary flex-1">{t('ai.edit')}</button>
        <button type="button" onClick={() => setConfirm(true)} aria-label={t('ai.deleteNamed', { name: c.name })} className="btn btn-secondary w-12 shrink-0 px-0 text-[var(--risky)]">
          <Trash2 size={18} aria-hidden />
        </button>
      </div>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title={t('ai.deleteTitle', { name: c.name })}>
        <p className="mb-4 text-sm">{t('ai.deleteBody')}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirm(false)} className="btn btn-secondary">{t('common.cancel')}</button>
          <button type="button" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => setConfirm(false) })} className="btn bg-[var(--risky)] text-white">
            {t('ai.delete')}
          </button>
        </div>
      </Sheet>
    </article>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function TestStatus({ pending, result, error }: { pending: boolean; result?: TestResult; error: string | null }) {
  const { t } = useI18n()
  if (!pending && !result && !error) return null
  return (
    <p role="status" className="flex items-start gap-2 text-sm">
      {pending ? (
        <><Loader2 size={16} aria-hidden className="spin mt-0.5" /> {t('ai.testing')}</>
      ) : result?.ok ? (
        <><CheckCircle2 size={16} aria-hidden className="mt-0.5 text-[var(--safe)]" /> {t(result.checked === 'chat' ? 'ai.testOkChat' : 'ai.testOkModels')}</>
      ) : (
        <><XCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--risky)]" /> <span className="break-words">{t('ai.testFailed', { error: result?.error ?? error ?? '' })}</span></>
      )}
    </p>
  )
}

// Add or edit a connection. Editing never shows the key: leave it empty to keep the current one.
function ConnectionSheet({ editing, onClose }: { editing: Connection | 'new' | null; onClose: () => void }) {
  const { t } = useI18n()
  const title = editing === 'new' ? t('ai.addTitle') : editing ? t('ai.editTitle', { name: editing.name }) : ''
  return (
    <Sheet open={editing !== null} onClose={onClose} title={title}>
      {editing && <ConnectionForm key={editing === 'new' ? 'new' : editing.id} editing={editing} onDone={onClose} />}
    </Sheet>
  )
}

function ConnectionForm({ editing, onDone }: { editing: Connection | 'new'; onDone: () => void }) {
  const { t, lang } = useI18n()
  const qc = useQueryClient()
  const existing = editing === 'new' ? null : editing
  const [preset, setPreset] = useState<string>(existing ? PRESETS.find((p) => p.url === existing.baseUrl)?.id ?? 'custom' : 'groq')
  const start = PRESETS.find((p) => p.id === preset)!
  const [f, setF] = useState({
    name: existing?.name ?? start.name,
    baseUrl: existing?.baseUrl ?? start.url,
    apiKey: '',
    providerName: existing?.providerName ?? start.name,
    regionNote: existing?.regionNote ?? start.region,
  })
  const [show, setShow] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const save = useMutation({
    mutationFn: () => {
      const body = existing ? { ...f, apiKey: f.apiKey || undefined } : f
      return existing
        ? api<{ test: TestResult }>(`/api/admin/ai/connections/${existing.id}`, { method: 'PATCH', body })
        : api<{ test: TestResult }>('/api/admin/ai/connections', { body })
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY })
      if (r.test.ok) onDone() // a failed test keeps the sheet open so the error is seen; the connection is saved either way
    },
  })
  const pick = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!
    setPreset(id)
    if (id !== 'custom') setF({ ...f, baseUrl: p.url, providerName: p.name, regionNote: p.region, name: f.name || p.name })
  }
  return (
    <form
      className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Select label={t('ai.provider')} value={preset} onChange={pick} options={PRESETS.map((p) => ({ value: p.id, label: p.id === 'custom' ? t('ai.custom') : p.name, hint: p.url || undefined }))} />
      <Field label={t('ai.name')} hint={t('ai.nameHint')}>
        {(id) => <input id={id} required maxLength={60} value={f.name} onChange={set('name')} className={inputCls} />}
      </Field>
      <Field label={t('ai.baseUrl')}>
        {(id) => <input id={id} type="url" required inputMode="url" readOnly={preset !== 'custom'} value={f.baseUrl} onChange={set('baseUrl')} className={`${inputCls} read-only:text-muted`} />}
      </Field>
      <Field label={t('ai.apiKey')} hint={existing ? t('ai.keepKey', { last4: existing.keyLast4 }) : undefined}>
        {(id) => (
          <div className="flex gap-2">
            <input id={id} type={show ? 'text' : 'password'} required={!existing} minLength={8} autoComplete="off" spellCheck={false} value={f.apiKey} onChange={set('apiKey')} className={`${inputCls} font-mono`} />
            <button type="button" onClick={() => setShow(!show)} aria-pressed={show} aria-label={t(show ? 'ai.hideKey' : 'ai.showKey')} className="pressable grid size-12 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-line-strong">
              {show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
            </button>
          </div>
        )}
      </Field>
      <Field label={t('ai.providerName')} hint={t('ai.privacyHint')}>
        {(id) => <input id={id} required maxLength={80} value={f.providerName} onChange={set('providerName')} className={inputCls} />}
      </Field>
      <Field label={t('ai.regionNote')}>
        {(id) => <textarea id={id} rows={3} maxLength={400} value={f.regionNote} onChange={set('regionNote')} className={`${inputCls} h-auto py-2`} />}
      </Field>
      <TestStatus pending={false} result={save.data?.test} error={save.error ? errorText(save.error, lang, t('ai.error')) : null} />
      <button type="submit" disabled={save.isPending} className="btn btn-primary">
        {save.isPending ? <><Loader2 size={18} aria-hidden className="spin" /> {t('ai.savingTesting')}</> : t('ai.saveTest')}
      </button>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

// One job's fallback list. Edited locally, saved as a whole.
function JobCard({ job, steps: saved, connections }: { job: Job; steps: Step[]; connections: Connection[] }) {
  const { t, lang } = useI18n()
  const qc = useQueryClient()
  const [steps, setSteps] = useState(saved)
  const [models, setModels] = useState<Record<number, string[] | 'loading' | 'error'>>({})
  const dirty = JSON.stringify(steps) !== JSON.stringify(saved)
  const save = useMutation({ mutationFn: () => api(`/api/admin/ai/jobs/${job}`, { method: 'PUT', body: steps }), onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) })
  const byId = new Map(connections.map((c) => [c.id, c]))
  const update = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps]
    ;[next[i], next[i + d]] = [next[i + d]!, next[i]!]
    setSteps(next)
  }
  const loadModels = async (id: number) => {
    setModels((m) => ({ ...m, [id]: 'loading' }))
    try {
      const r = await api<{ models: string[] }>(`/api/admin/ai/connections/${id}/models`)
      setModels((m) => ({ ...m, [id]: r.models }))
    } catch {
      setModels((m) => ({ ...m, [id]: 'error' }))
    }
  }
  const usable = steps.some((s) => byId.get(s.connectionId)?.decryptable && byId.get(s.connectionId)?.status !== 'failing')
  return (
    <article className={card} aria-labelledby={`job-${job}`}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: `var(--c-${job})` }} />
        <div className="min-w-0 flex-1">
          <h3 id={`job-${job}`} className="font-semibold">{t(`ai.job.${job}`)}</h3>
          <p className="text-sm text-muted">{t(`ai.jobHelp.${job}`)}</p>
        </div>
        {!usable && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted">
            <XCircle size={14} aria-hidden /> {t('ai.off')}
          </span>
        )}
      </div>
      {steps.length > 0 && (
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => {
            const list = models[s.connectionId]
            const listId = `models-${job}-${i}`
            return (
              <li key={i} className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-surface-2 p-3">
                <div className="flex items-center gap-1">
                  <span className="flex-1 text-xs font-semibold text-muted">{i === 0 ? t('ai.first') : t('ai.fallback', { n: i })}</span>
                  <IconBtn label={t('ai.moveUp', { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={18} aria-hidden /></IconBtn>
                  <IconBtn label={t('ai.moveDown', { n: i + 1 })} disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown size={18} aria-hidden /></IconBtn>
                  <IconBtn label={t('ai.removeStep', { n: i + 1 })} onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 size={18} aria-hidden /></IconBtn>
                </div>
                <Select compact label={t('ai.connection')} value={s.connectionId} onChange={(v) => update(i, { connectionId: v })} options={connections.map((c) => ({ value: c.id, label: `${c.name} · …${c.keyLast4}`, hint: c.status !== 'ok' || !c.decryptable ? t(!c.decryptable ? 'ai.undecryptable' : c.status === 'failing' ? 'ai.failing' : 'ai.coolingShort') : undefined }))} />
                <Field label={t('ai.model')}>
                  {(id) => (
                    <div className="flex gap-2">
                      <input id={id} required list={Array.isArray(list) ? listId : undefined} value={s.model} onChange={(e) => update(i, { model: e.target.value })} spellCheck={false} className={`${inputCls} h-11 bg-surface font-mono text-sm`} />
                      <button type="button" onClick={() => loadModels(s.connectionId)} disabled={list === 'loading'} className="btn btn-secondary h-11 min-h-0 w-auto whitespace-nowrap px-3">
                        {list === 'loading' ? <Loader2 size={16} aria-hidden className="spin" /> : t('ai.loadModels')}
                      </button>
                      {Array.isArray(list) && <datalist id={listId}>{list.map((m) => <option key={m} value={m} />)}</datalist>}
                    </div>
                  )}
                </Field>
                {list === 'error' && <p className="text-xs text-[var(--risky)]">{t('ai.modelsFailed')}</p>}
                {Array.isArray(list) && <p className="text-xs text-muted">{t('ai.modelsLoaded', { n: list.length })}</p>}
                <Select compact label={t('ai.reasoning')} value={s.reasoning ?? ''} onChange={(v) => update(i, { reasoning: v || null })} options={['', 'none', 'minimal', 'low', 'medium', 'high', 'default'].map((v) => ({ value: v, label: v ? v : t('ai.reasoningDefault') }))} />
              </li>
            )
          })}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={connections.length === 0 || steps.length >= 6} onClick={() => setSteps([...steps, { connectionId: connections[0]!.id, model: steps.at(-1)?.model ?? '', reasoning: null }])} className="btn btn-secondary flex-1">
          <Plus size={18} aria-hidden /> {steps.length ? t('ai.addFallback') : t('ai.addFirst')}
        </button>
        {dirty && (
          <button type="button" disabled={save.isPending || steps.some((s) => !s.model.trim())} onClick={() => save.mutate()} className="btn btn-primary flex-1">
            {save.isPending ? <Loader2 size={18} aria-hidden className="spin" /> : t('ai.saveJob')}
          </button>
        )}
      </div>
      {save.error && <p role="alert" className="text-sm text-[var(--risky)]">{errorText(save.error, lang, t('ai.error'))}</p>}
    </article>
  )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="pressable grid size-11 place-items-center rounded-full hover:bg-surface disabled:opacity-30">
      {children}
    </button>
  )
}
