'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createServiceAreaAction } from '../../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 flex-shrink-0 transition-opacity"
      style={{ backgroundColor: '#38C7CA' }}
    >
      {pending ? 'Creating…' : 'Create Area'}
    </button>
  )
}

export default function CreateAreaForm() {
  const [state, action] = useActionState(createServiceAreaAction, {})

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input
          name="name"
          required
          placeholder="Area name (e.g. Atlanta Midtown)"
          className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#38C7CA] transition-colors"
        />
        <input
          name="city"
          placeholder="City"
          className="w-36 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#38C7CA] transition-colors"
        />
        <select
          name="status"
          defaultValue="waitlist_only"
          className="w-44 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-[#38C7CA] bg-white"
        >
          <option value="waitlist_only">Waitlist Only</option>
          <option value="beta_open">Active (beta_open)</option>
          <option value="paused_recruiting_cleaners">Paused</option>
          <option value="closed">Closed</option>
        </select>
        <SubmitButton />
      </div>
      {state?.error && <p className="text-red-500 text-xs">{state.error}</p>}
      {state?.success && <p className="text-green-600 text-xs">Area created!</p>}
    </form>
  )
}
