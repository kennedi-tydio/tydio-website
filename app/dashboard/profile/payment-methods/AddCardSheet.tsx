'use client'

import { useEffect, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { createSetupIntentAction, savePaymentMethodAction, type SavedPaymentMethod } from './actions'
import { LoadingSpinner } from '@/app/components/LoadingSpinner'
import ModalShell from '@/app/components/ModalShell'

let stripePromise: Promise<Stripe | null> | null = null
function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  }
  return stripePromise
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M12 4L4 12M4 4l8 8" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function AddCardSheet({
  onSaved,
  onClose,
}: {
  onSaved: (pm: SavedPaymentMethod) => void
  onClose: () => void
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    createSetupIntentAction().then((result) => {
      if (cancelled) return
      if ('error' in result) setError(result.error)
      else setClientSecret(result.clientSecret)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ModalShell className="fixed inset-0 z-50 flex items-end justify-center" panelClassName="w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-8 shadow-2xl" onClose={onClose} labelledBy="add-card-title">
      <div className="flex items-center justify-between mb-5">
        <h2 id="add-card-title" className="text-xl font-bold text-slate-900">Add payment method</h2>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100" aria-label="Close">
          <IconClose />
        </button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">{error}</p>
      )}

      {clientSecret ? (
        <Elements
          stripe={getStripe()}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#38C7CA',
                colorText: '#1a2332',
                colorDanger: '#dc2626',
                fontFamily: 'inherit',
                borderRadius: '10px',
              },
            },
          }}
        >
          <CardForm onSaved={onSaved} onClose={onClose} />
        </Elements>
      ) : !error ? (
        <div className="py-10 flex justify-center"><LoadingSpinner /></div>
      ) : null}
    </ModalShell>
  )
}

function CardForm({
  onSaved,
  onClose,
}: {
  onSaved: (pm: SavedPaymentMethod) => void
  onClose: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!stripe || !elements) return

    setSaving(true)
    setError(null)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message ?? 'Check your card details and try again.')
      setSaving(false)
      return
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message ?? 'Could not save card.')
      setSaving(false)
      return
    }

    if (!setupIntent) {
      setError('Something went wrong saving your card.')
      setSaving(false)
      return
    }

    const result = await savePaymentMethodAction(setupIntent.id)
    setSaving(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    onSaved(result)
  }

  return (
    <>
      <div className="mb-5">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">{error}</p>
      )}

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!stripe || !elements || saving}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: '#1a2332' }}
        >
          {saving ? 'Saving…' : 'Save card'}
        </button>
      </div>
    </>
  )
}
