'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createStatePriceAction, researchStatePriceAction } from '../../actions'
import { US_STATES } from '@/lib/usStates'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 flex-shrink-0 transition-opacity"
      style={{ backgroundColor: '#38C7CA' }}
    >
      {pending ? 'Adding…' : 'Add State Price'}
    </button>
  )
}

function ResearchButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      formAction={researchStatePriceAction}
      disabled={pending}
      className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 disabled:opacity-60 flex-shrink-0 hover:bg-slate-50 transition-colors"
    >
      {pending ? 'Researching…' : 'Research with AI'}
    </button>
  )
}

export default function StatePriceForm() {
  const [state, action] = useActionState(createStatePriceAction, {})

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <select
          name="state"
          required
          defaultValue=""
          className="w-52 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#38C7CA] bg-white"
        >
          <option value="" disabled>
            State
          </option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          name="median_four_hour_price"
          inputMode="decimal"
          placeholder="Median 4-hr price (e.g. 150.00) — or leave blank and research"
          className="w-72 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#38C7CA] transition-colors"
        />
        <SubmitButton />
        <ResearchButton />
      </div>
      {state?.error && <p className="text-red-500 text-xs">{state.error}</p>}
      {state?.success && <p className="text-green-600 text-xs">State price added!</p>}
    </form>
  )
}
