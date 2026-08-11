'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createPaymentMethodAction,
  selectPaymentMethodForDraftAction,
  type SavedPaymentMethod,
} from './actions'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconShieldCheck() {
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#38C7CA' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </div>
  )
}

function CardBrandBadge({ brand }: { brand: string }) {
  if (brand === 'Visa') {
    return (
      <div className="w-9 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1a1f71' }}>
        <span className="text-white text-[10px] font-bold italic tracking-tight">VISA</span>
      </div>
    )
  }
  if (brand === 'Mastercard') {
    return (
      <div className="w-9 h-6 rounded bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 relative">
        <span className="w-3.5 h-3.5 rounded-full bg-[#eb001b] -mr-1.5" />
        <span className="w-3.5 h-3.5 rounded-full bg-[#f79e1b] opacity-90" />
      </div>
    )
  }
  return (
    <div className="w-9 h-6 rounded bg-slate-700 flex items-center justify-center flex-shrink-0">
      <span className="text-white text-[9px] font-bold uppercase">{brand}</span>
    </div>
  )
}

function StripeNotice() {
  return (
    <div className="rounded-2xl px-4 py-4 mb-4 flex items-start gap-3" style={{ backgroundColor: '#e8f9fa' }}>
      <IconShieldCheck />
      <div>
        <p className="text-sm font-bold" style={{ color: '#1a2332' }}>
          Tydio partners with Stripe for secure financial services
        </p>
        <p className="text-xs text-slate-500 mt-0.5">Manage your payment methods on Stripe</p>
      </div>
    </div>
  )
}

type Props = {
  initialPaymentMethods: SavedPaymentMethod[]
  draftId: string | null
  initialSelectedId: string | null
}

export default function PaymentMethodsView({ initialPaymentMethods, draftId, initialSelectedId }: Props) {
  const router = useRouter()
  const [paymentMethods, setPaymentMethods] = useState(initialPaymentMethods)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [showAddCard, setShowAddCard] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const backHref = draftId ? '/book/review' : '/dashboard/profile'

  async function handleConfirmSelection() {
    if (!draftId || !selectedId) return
    setSubmitting(true)
    const result = await selectPaymentMethodForDraftAction(draftId, selectedId)
    setSubmitting(false)
    if (!('error' in result)) router.push('/book/review')
  }

  function handleCardAdded(pm: SavedPaymentMethod) {
    setPaymentMethods((prev) => [...prev, pm])
    setSelectedId(pm.id)
    setShowAddCard(false)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-8 max-w-sm mx-auto w-full">
        <Link href={backHref} aria-label="Back" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <IconBack />
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-5">Payment Methods</h1>

        <StripeNotice />

        {paymentMethods.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 shadow-sm py-14 px-6 text-center">
            <p className="font-bold text-slate-900 mb-1.5">No payment methods yet</p>
            <p className="text-sm text-slate-400 leading-relaxed">
              Add a payment method to begin requesting bookings
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {paymentMethods.map((pm) => {
              const isSelected = pm.id === selectedId
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setSelectedId(pm.id)}
                  className="w-full rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 flex items-center gap-3 text-left"
                >
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-[#38C7CA]' : 'border-slate-300'}`}
                  >
                    {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-[#38C7CA]" />}
                  </span>
                  <CardBrandBadge brand={pm.brand} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">**** {pm.last4}</p>
                    <p className="text-xs text-slate-400">
                      expires {pm.exp_month}/{String(pm.exp_year).slice(-2)}
                    </p>
                  </div>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setShowAddCard(true)}
              className="flex items-center gap-2 text-sm font-semibold mt-1 px-1 py-1.5"
              style={{ color: '#38C7CA' }}
            >
              <span className="text-lg leading-none">+</span> Add new card
            </button>
          </div>
        )}
      </div>

      <div className="px-5 pb-6 max-w-sm mx-auto w-full">
        {paymentMethods.length === 0 ? (
          <button
            type="button"
            onClick={() => setShowAddCard(true)}
            className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide"
            style={{ backgroundColor: '#38C7CA' }}
          >
            Add payment method
          </button>
        ) : draftId ? (
          <button
            type="button"
            onClick={handleConfirmSelection}
            disabled={!selectedId || submitting}
            className="w-full py-4 rounded-2xl font-semibold text-base tracking-wide text-white disabled:text-slate-400 transition-colors"
            style={{ backgroundColor: selectedId ? '#38C7CA' : '#e5e9ef' }}
          >
            {submitting ? 'Saving…' : 'Select payment method'}
          </button>
        ) : null}
        <p className="text-center text-xs font-semibold text-slate-900 mt-4">Powered by Stripe</p>
      </div>

      {showAddCard && <AddCardSheet onSaved={handleCardAdded} onClose={() => setShowAddCard(false)} />}
    </div>
  )
}

function AddCardSheet({
  onSaved,
  onClose,
}: {
  onSaved: (pm: SavedPaymentMethod) => void
  onClose: () => void
}) {
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const [mm, yy] = expiry.split('/').map((p) => p.trim())
    const expMonth = Number(mm)
    const expYear = yy ? 2000 + Number(yy) : NaN

    if (!expMonth || !expYear) {
      setError('Enter expiration as MM/YY.')
      return
    }

    setSaving(true)
    setError(null)
    const result = await createPaymentMethodAction({ cardNumber, expMonth, expYear })
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onSaved(result)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-8 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-slate-900">Add payment method</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 overflow-hidden mb-5">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Card number"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 border-b border-slate-200 focus:outline-none"
          />
          <input
            type="text"
            placeholder="MM/YY"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">{error}</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !cardNumber || !expiry}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: '#1a2332' }}
          >
            {saving ? 'Saving…' : 'Save card'}
          </button>
        </div>
      </div>
    </div>
  )
}
