'use client'

import { Fragment, useActionState, useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import {
  PROMO_CODE_MAX_LENGTH,
  PROMO_MAX_AMOUNT_OFF,
  PROMO_MESSAGE_MAX,
  describePromoDiscount,
  generatePromoCode,
  normalizePromoCode,
  type PromoDiscountType,
} from '@/lib/promoCodes'
import type { AdminPromoCode, PromoRecipientCandidate } from '@/lib/promoCodesData'
import { createPromoCodeAction, sendPromoCodeAction, setPromoCodeActiveAction, type PromoFormState } from './actions'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand transition-colors'
const cardClass = 'bg-white rounded-2xl border border-slate-100 shadow-sm p-5'

type Props = {
  promos: AdminPromoCode[]
  customers: PromoRecipientCandidate[]
  emailedTo: Record<string, string[]>
}

function displayName(c: PromoRecipientCandidate): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email
}

function isExpired(p: AdminPromoCode): boolean {
  return !!p.expires_at && new Date(p.expires_at).getTime() <= Date.now()
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

function Submit({ idle, busy, disabled }: { idle: string; busy: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 transition-opacity bg-brand"
    >
      {pending ? busy : idle}
    </button>
  )
}

function Status({ state }: { state: PromoFormState }) {
  if (state.error) return <p role="alert" className="text-red-500 text-xs">{state.error}</p>
  if (state.message) return <p className="text-green-600 text-xs">{state.message}</p>
  return null
}

function NewPromoCodeForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<PromoDiscountType>('percent')
  const [state, action] = useActionState(async (prev: PromoFormState, formData: FormData) => {
    const result = await createPromoCodeAction(prev, formData)
    if (result.createdId) {
      onCreated(result.createdId)
      setCode('')
    }
    return result
  }, {})

  return (
    <form action={action} className={`${cardClass} space-y-4`}>
      <h2 className="font-semibold text-slate-900">New promo code</h2>

      <div>
        <label htmlFor="promo-code" className="block text-sm font-semibold text-slate-900 mb-1">Code</label>
        <div className="flex gap-2">
          <input
            id="promo-code"
            name="code"
            required
            maxLength={PROMO_CODE_MAX_LENGTH}
            value={code}
            onChange={(e) => setCode(normalizePromoCode(e.target.value))}
            placeholder="SPRING20"
            className={`${inputClass} font-mono tracking-wide`}
          />
          <button
            type="button"
            onClick={() => setCode(generatePromoCode())}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 flex-shrink-0"
          >
            Generate
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">Letters, numbers and dashes. Customers can type it in any case.</p>
      </div>

      <fieldset>
        <legend className="block text-sm font-semibold text-slate-900 mb-1">Discount</legend>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0" role="radiogroup">
            {(['percent', 'amount'] as const).map((t) => (
              <label
                key={t}
                className={`cursor-pointer px-3 py-2 text-sm font-medium ${discountType === t ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}
              >
                <input
                  type="radio"
                  name="discount_type"
                  value={t}
                  checked={discountType === t}
                  onChange={() => setDiscountType(t)}
                  className="sr-only"
                />
                {t === 'percent' ? '% off' : '$ off'}
              </label>
            ))}
          </div>
          <input
            name="discount_value"
            aria-label={discountType === 'percent' ? 'Percent off' : 'Dollars off'}
            type="number"
            required
            min={discountType === 'percent' ? 1 : 0.01}
            max={discountType === 'percent' ? 100 : PROMO_MAX_AMOUNT_OFF}
            step={discountType === 'percent' ? 1 : 0.01}
            placeholder={discountType === 'percent' ? '20' : '15.00'}
            className={inputClass}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1">Comes off the booking price. The customer always pays at least $1 plus the card fee.</p>
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="promo-expires" className="block text-sm font-semibold text-slate-900 mb-1">
            Last day <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input id="promo-expires" name="expires_on" type="date" className={inputClass} />
        </div>
        <div>
          <label htmlFor="promo-max" className="block text-sm font-semibold text-slate-900 mb-1">
            Total uses <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input id="promo-max" name="max_redemptions" type="number" min={1} step={1} placeholder="No limit" className={inputClass} />
        </div>
        <div>
          <label htmlFor="promo-per-customer" className="block text-sm font-semibold text-slate-900 mb-1">
            Per customer
          </label>
          <input
            id="promo-per-customer"
            name="max_uses_per_customer"
            type="number"
            min={1}
            step={1}
            defaultValue={1}
            placeholder="No limit"
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Per customer is how many bookings each customer can use it on. Clear it for no limit.
      </p>

      <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" name="recipients_only" defaultChecked className="mt-0.5 accent-brand" />
        <span>
          Only customers I email it to can use it
          <span className="block text-xs text-slate-400">Untick for a public code anyone can enter.</span>
        </span>
      </label>

      <div className="flex items-center gap-4 flex-wrap">
        <Submit idle="Create code" busy="Creating…" />
        <Status state={state} />
      </div>
    </form>
  )
}

function SendPromoCodeForm({
  promos,
  customers,
  emailedTo,
  selectedPromoId,
  onSelectPromo,
}: Props & { selectedPromoId: string; onSelectPromo: (id: string) => void }) {
  const [state, action] = useActionState(async (prev: PromoFormState, formData: FormData) => {
    const result = await sendPromoCodeAction(prev, formData)
    // Once a send goes out, start fresh so the same people/message aren't re-sent by accident.
    if (!result.error) {
      setSelected(new Set())
      setMessage('')
    }
    return result
  }, {})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [optedInOnly, setOptedInOnly] = useState(false)
  const [hideAlreadySent, setHideAlreadySent] = useState(false)
  const [message, setMessage] = useState('')

  const sendable = promos.filter((p) => p.active && !isExpired(p))
  const promo = sendable.find((p) => p.id === selectedPromoId) ?? null
  const alreadySent = new Set(promo ? emailedTo[promo.id] ?? [] : [])

  const q = search.trim().toLowerCase()
  const visible = customers.filter(
    (c) =>
      (!optedInOnly || c.marketingOptIn) &&
      (!hideAlreadySent || !alreadySent.has(c.id)) &&
      (!q || `${displayName(c)} ${c.email}`.toLowerCase().includes(q))
  )

  const notOptedIn = customers.filter((c) => selected.has(c.id) && !c.marketingOptIn).length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllShown() {
    setSelected((prev) => new Set([...prev, ...visible.map((c) => c.id)]))
  }

  function confirmSend(e: React.FormEvent<HTMLFormElement>) {
    const count = selected.size
    const warning =
      notOptedIn > 0
        ? `\n\n${notOptedIn} of them didn't opt in to marketing emails. Only send to them if this is a personal offer they'd expect.`
        : ''
    if (!window.confirm(`Email ${promo?.code} to ${count} ${count === 1 ? 'customer' : 'customers'}?${warning}`)) e.preventDefault()
  }

  if (sendable.length === 0) {
    return (
      <div className={cardClass}>
        <h2 className="font-semibold text-slate-900 mb-1">Email a code</h2>
        <p className="text-sm text-slate-500">Create a promo code first. Codes that are off or expired can&apos;t be sent.</p>
      </div>
    )
  }

  return (
    <form action={action} onSubmit={confirmSend} className={`${cardClass} space-y-4`}>
      <h2 className="font-semibold text-slate-900">Email a code</h2>

      <div>
        <label htmlFor="send-promo" className="block text-sm font-semibold text-slate-900 mb-1">Code</label>
        <select
          id="send-promo"
          name="promo_code_id"
          value={promo?.id ?? ''}
          onChange={(e) => onSelectPromo(e.target.value)}
          className={`${inputClass} bg-white`}
        >
          {!promo && <option value="">Choose a code</option>}
          {sendable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {describePromoDiscount(p)}
              {p.recipients_only ? ' · emailed customers only' : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm font-semibold text-slate-900">Customers</span>
          <span className="text-xs text-slate-400">{selected.size} selected</span>
        </div>
        <input
          type="search"
          aria-label="Search customers"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} mb-2`}
        />
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mb-2 text-xs text-slate-600">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={optedInOnly} onChange={(e) => setOptedInOnly(e.target.checked)} className="accent-brand" />
            Opted in to emails only
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={hideAlreadySent} onChange={(e) => setHideAlreadySent(e.target.checked)} className="accent-brand" />
            Hide anyone already sent this code
          </label>
          <span className="flex-1" />
          <button type="button" onClick={selectAllShown} className="font-semibold text-slate-700 hover:underline">
            Select all shown ({visible.length})
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="font-semibold text-slate-400 hover:underline">
            Clear
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100 divide-y divide-slate-100">
          {visible.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">{customers.length === 0 ? 'No customers yet.' : 'No one matches.'}</p>
          ) : (
            visible.map((c) => (
              <label key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="flex-1 min-w-0">
                  <span className="block text-slate-900 truncate">{displayName(c)}</span>
                  <span className="block text-xs text-slate-400 truncate">{c.email}</span>
                </span>
                <span className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  {alreadySent.has(c.id) && <span className="text-[11px] font-semibold text-amber-700">Already sent</span>}
                  <span className={`text-[11px] ${c.marketingOptIn ? 'text-green-700' : 'text-slate-400'}`}>
                    {c.marketingOptIn ? 'Opted in' : 'Not opted in'}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        {/* Every ticked customer is sent, even ones hidden by the search or filters. */}
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
      </div>

      <div>
        <label htmlFor="promo-message" className="block text-sm font-semibold text-slate-900 mb-1">
          Message <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="promo-message"
          name="message"
          rows={3}
          maxLength={PROMO_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Thanks for being one of our first customers!"
          className={inputClass}
        />
        <p className="text-xs text-slate-400 mt-1">Shown above the code. The email already says what the code takes off and how to use it.</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Submit
          idle={`Email ${selected.size} ${selected.size === 1 ? 'customer' : 'customers'}`}
          busy="Sending…"
          disabled={!promo || selected.size === 0}
        />
        <Status state={state} />
      </div>
    </form>
  )
}

function PromoCodeTable({ promos }: { promos: AdminPromoCode[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // The code whose per-customer uses are open.
  const [openId, setOpenId] = useState<string | null>(null)

  function setActive(id: string, active: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setPromoCodeActiveAction(id, active)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className={cardClass}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-semibold text-slate-900">All codes</h2>
        {error && <p role="alert" className="text-red-500 text-xs">{error}</p>}
      </div>
      {promos.length === 0 ? (
        <p className="text-sm text-slate-400">No promo codes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Discount</th>
                <th className="py-2 pr-4 font-medium">Who can use it</th>
                <th className="py-2 pr-4 font-medium">Uses</th>
                <th className="py-2 pr-4 font-medium">Per customer</th>
                <th className="py-2 pr-4 font-medium">Emailed</th>
                <th className="py-2 pr-4 font-medium">Discounts given</th>
                <th className="py-2 pr-4 font-medium">Last day</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {promos.map((p) => {
                const expired = isExpired(p)
                const isOpen = openId === p.id
                return (
                  <Fragment key={p.id}>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono font-semibold text-slate-900">{p.code}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{describePromoDiscount(p)}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.recipients_only ? 'Emailed customers' : 'Anyone'}</td>
                    <td className="py-2.5 pr-4 text-slate-700">
                      {p.uses > 0 ? (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setOpenId(isOpen ? null : p.id)}
                          className="font-medium underline decoration-dotted underline-offset-2 hover:text-slate-900"
                          title="See uses per customer"
                        >
                          {p.uses}
                          {p.max_redemptions != null && <span className="text-slate-400"> / {p.max_redemptions}</span>}
                          <span className="ml-1 text-slate-400">{isOpen ? '▴' : '▾'}</span>
                        </button>
                      ) : (
                        <>
                          0{p.max_redemptions != null && <span className="text-slate-400"> / {p.max_redemptions}</span>}
                        </>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500">
                      {p.max_uses_per_customer == null ? 'No limit' : p.max_uses_per_customer}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700">{p.emailed}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{money(p.discountGiven)}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.expires_at ? shortDate(p.expires_at) : '—'}</td>
                    <td className="py-2.5">
                      {expired ? (
                        <span className="text-xs font-semibold text-slate-400">Expired</span>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setActive(p.id, !p.active)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border disabled:opacity-50 ${
                            p.active ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500'
                          }`}
                          title={p.active ? 'Turn off: customers can no longer apply it' : 'Turn back on'}
                        >
                          {p.active ? 'On' : 'Off'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={9} className="pb-3">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-slate-400">
                                <th className="px-3 py-2 font-medium">Customer</th>
                                <th className="px-3 py-2 font-medium">Times used</th>
                                <th className="px-3 py-2 font-medium">Discount given</th>
                                <th className="px-3 py-2 font-medium">Last used</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {p.usesByCustomer.map((u) => {
                                const atLimit = p.max_uses_per_customer != null && u.uses >= p.max_uses_per_customer
                                return (
                                  <tr key={u.customerId}>
                                    <td className="px-3 py-2">
                                      <span className="block text-slate-900">{u.name}</span>
                                      {u.email && u.email !== u.name && <span className="block text-slate-400">{u.email}</span>}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {u.uses}
                                      {p.max_uses_per_customer != null && <span className="text-slate-400"> / {p.max_uses_per_customer}</span>}
                                      {atLimit && <span className="ml-2 font-semibold text-amber-700">Used up</span>}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">{money(u.discount)}</td>
                                    <td className="px-3 py-2 text-slate-500">{shortDate(u.lastUsedAt)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function PromoCodesAdmin({ promos, customers, emailedTo }: Props) {
  // The code the email form sends; a newly created code is picked automatically.
  const [chosenPromoId, setChosenPromoId] = useState<string | null>(null)
  const firstSendable = promos.find((p) => p.active && !isExpired(p))?.id ?? ''

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] items-start">
        <NewPromoCodeForm onCreated={setChosenPromoId} />
        <SendPromoCodeForm
          promos={promos}
          customers={customers}
          emailedTo={emailedTo}
          selectedPromoId={chosenPromoId ?? firstSendable}
          onSelectPromo={setChosenPromoId}
        />
      </div>
      <PromoCodeTable promos={promos} />
    </div>
  )
}
