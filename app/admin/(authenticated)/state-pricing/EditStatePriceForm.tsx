'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { updateStatePriceAction } from '../../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60 transition-opacity"
      style={{ backgroundColor: '#38C7CA' }}
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  )
}

export default function EditStatePriceForm({
  statePricingId,
  currentPrice,
}: {
  statePricingId: string
  currentPrice: number
}) {
  const action = updateStatePriceAction.bind(null, statePricingId)
  const [state, formAction] = useActionState(action, {})

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        name="median_four_hour_price"
        required
        inputMode="decimal"
        defaultValue={currentPrice}
        placeholder="e.g. 150.00"
        className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-[#38C7CA] transition-colors"
      />
      <SubmitButton />
      {state?.error && <span className="text-red-500 text-xs">{state.error}</span>}
    </form>
  )
}
