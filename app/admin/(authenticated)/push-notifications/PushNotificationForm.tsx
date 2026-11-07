'use client'

import { useActionState, useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendAdminPushAction } from '../../actions'
import { PUSH_BODY_MAX, PUSH_TITLE_MAX, type PushAudience, type PushRecipient } from '@/lib/adminPush'

const AUDIENCE_OPTIONS: { value: PushAudience; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'customers', label: 'All customers' },
  { value: 'pros', label: 'All Tidy Pros' },
  { value: 'selected', label: 'Select people' },
]

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand transition-colors'

function displayName(r: PushRecipient): string {
  const name = [r.firstName, r.lastName].filter(Boolean).join(' ')
  return name || r.email
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 transition-opacity bg-brand"
    >
      {pending ? 'Sending…' : `Send to ${count} ${count === 1 ? 'person' : 'people'}`}
    </button>
  )
}

export default function PushNotificationForm({ recipients }: { recipients: PushRecipient[] }) {
  const [state, action] = useActionState(sendAdminPushAction, {})
  const [audience, setAudience] = useState<PushAudience>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('Tydio')
  const [body, setBody] = useState('')

  const count = useMemo(() => {
    if (audience === 'all') return recipients.length
    if (audience === 'customers') return recipients.filter((r) => r.role === 'USER').length
    if (audience === 'pros') return recipients.filter((r) => r.role === 'TIDYPRO').length
    return selected.size
  }, [audience, recipients, selected])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recipients
    return recipients.filter((r) => `${displayName(r)} ${r.email}`.toLowerCase().includes(q))
  }, [recipients, search])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function confirmSend(e: React.FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Send "${title}" to ${count} ${count === 1 ? 'person' : 'people'}? This can't be undone.`)) {
      e.preventDefault()
    }
  }

  return (
    <form action={action} onSubmit={confirmSend} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-900 mb-2">Send to</legend>
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`cursor-pointer px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                audience === o.value ? 'border-brand text-slate-900 bg-slate-50' : 'border-slate-200 text-slate-600'
              }`}
            >
              <input
                type="radio"
                name="audience"
                value={o.value}
                checked={audience === o.value}
                onChange={() => setAudience(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      {audience === 'selected' && (
        <div>
          <input
            type="search"
            aria-label="Search people"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} mb-2`}
          />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
            {visible.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">No one matches.</p>
            ) : (
              visible.map((r) => (
                <label key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-slate-900 truncate">{displayName(r)}</span>
                    <span className="block text-xs text-slate-400 truncate">{r.email}</span>
                  </span>
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {r.role === 'TIDYPRO' ? 'Tidy Pro' : 'Customer'} · {r.devices}{' '}
                    {r.devices === 1 ? 'device' : 'devices'}
                  </span>
                </label>
              ))
            )}
          </div>
          {/* Every ticked person is submitted, even ones hidden by the search. */}
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
        </div>
      )}

      <div>
        <label htmlFor="push-title" className="block text-sm font-semibold text-slate-900 mb-1">
          Subject
        </label>
        <input
          id="push-title"
          name="title"
          required
          maxLength={PUSH_TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="push-body" className="block text-sm font-semibold text-slate-900 mb-1">
          Body
        </label>
        <textarea
          id="push-body"
          name="body"
          required
          rows={3}
          maxLength={PUSH_BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={inputClass}
        />
        <p className="text-xs text-slate-400 mt-1 text-right">
          {body.length}/{PUSH_BODY_MAX}
        </p>
      </div>

      <div>
        <label htmlFor="push-url" className="block text-sm font-semibold text-slate-900 mb-1">
          Opens <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input id="push-url" name="url" placeholder="/" className={inputClass} />
        <p className="text-xs text-slate-400 mt-1">The page that opens when they tap it, like /pro or /dashboard.</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <SubmitButton count={count} />
        {state?.error && (
          <p role="alert" className="text-red-500 text-xs">
            {state.error}
          </p>
        )}
        {state?.message && <p className="text-green-600 text-xs">{state.message}</p>}
      </div>
    </form>
  )
}
