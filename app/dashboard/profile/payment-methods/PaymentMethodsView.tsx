'use client'

import { useState } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { removePaymentMethodAction, selectPaymentMethodForDraftAction, type SavedPaymentMethod } from './actions'
import AddCardSheet from './AddCardSheet'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconShieldCheck() {
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-brand)' }}>
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
  const [removingId, setRemovingId] = useState<string | null>(null)

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

  async function handleRemove(id: string) {
    setRemovingId(id)
    const result = await removePaymentMethodAction(id)
    setRemovingId(null)
    if ('error' in result) return
    setPaymentMethods((prev) => prev.filter((pm) => pm.id !== id))
    setSelectedId((prev) => (prev === id ? null : prev))
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-8 max-w-sm mx-auto w-full">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4">
          <IconBack />
        </button>

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
                <div
                  key={pm.id}
                  className="w-full rounded-2xl border border-slate-100 shadow-sm px-4 py-3.5 flex items-center gap-3"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(pm.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-brand' : 'border-slate-300'}`}
                    >
                      {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}
                    </span>
                    <CardBrandBadge brand={pm.brand} />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">**** {pm.last4}</p>
                      <p className="text-xs text-slate-400">
                        expires {pm.exp_month}/{String(pm.exp_year).slice(-2)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(pm.id)}
                    disabled={removingId === pm.id}
                    aria-label={`Remove card ending in ${pm.last4}`}
                    className="flex-shrink-0 text-xs font-semibold text-slate-400 hover:text-red-500 disabled:opacity-40 px-1"
                  >
                    {removingId === pm.id ? '…' : 'Remove'}
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => setShowAddCard(true)}
              className="flex items-center gap-2 text-sm font-semibold mt-1 px-1 py-1.5"
              style={{ color: 'var(--color-brand)' }}
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
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Add payment method
          </button>
        ) : draftId ? (
          <button
            type="button"
            onClick={handleConfirmSelection}
            disabled={!selectedId || submitting}
            className="w-full py-4 rounded-2xl font-semibold text-base tracking-wide text-white disabled:text-slate-400 transition-colors"
            style={{ backgroundColor: selectedId ? 'var(--color-brand)' : '#e5e9ef' }}
          >
            {submitting ? 'Saving…' : 'Select payment method'}
          </button>
        ) : null}
        <p className="text-center text-xs font-semibold text-slate-900 mt-4">Powered by Stripe</p>
      </div>

      {showAddCard && <AddCardSheet onSaved={handleCardAdded} onClose={() => setShowAddCard(false)} />}
    </main>
  )
}
