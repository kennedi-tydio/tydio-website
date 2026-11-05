'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { sendBackgroundCheckLinkAction, type SendBackgroundCheckLinkState } from '../../actions'

function SubmitButton({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={`${className} self-start disabled:opacity-50 disabled:cursor-not-allowed`}>
      {pending ? 'Sending…' : label}
    </button>
  )
}

// Shows why a send didn't go through (e.g. resending within a minute) next to
// the button, rather than on an error page.
export default function SendLinkForm({
  proId,
  defaultLink,
  label,
  buttonClassName,
}: {
  proId: string
  defaultLink: string
  label: string
  buttonClassName: string
}) {
  const [state, formAction] = useActionState<SendBackgroundCheckLinkState, FormData>(
    sendBackgroundCheckLinkAction.bind(null, proId),
    {}
  )

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input
        aria-label="Background check and ID verification link"
        name="link"
        type="url"
        required
        defaultValue={defaultLink}
        placeholder="Paste this cleaner's link"
        className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:border-brand"
      />
      <SubmitButton label={label} className={buttonClassName} />
      {state.error && <p role="alert" className="text-xs text-red-600 max-w-48">{state.error}</p>}
      {state.message && <p role="status" className="text-xs text-green-700">{state.message}</p>}
    </form>
  )
}
