'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { addZipCodeAction } from '../../actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-60 transition-opacity"
      style={{ backgroundColor: '#1a2332' }}
    >
      {pending ? '…' : 'Add ZIP'}
    </button>
  )
}

export default function AddZipForm({ serviceAreaId }: { serviceAreaId: string }) {
  const [state, action] = useActionState(addZipCodeAction, {})
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="service_area_id" value={serviceAreaId} />
      <input
        name="zip_code"
        placeholder="Add ZIP code"
        maxLength={5}
        pattern="\d{5}"
        className="w-32 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:border-[#38C7CA] transition-colors"
      />
      <SubmitButton />
      {state?.error && (
        <span className="text-red-500 text-xs">{state.error}</span>
      )}
      {state?.success && (
        <span className="text-green-600 text-xs">Added!</span>
      )}
    </form>
  )
}
