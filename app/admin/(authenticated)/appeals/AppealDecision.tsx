'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { acceptAppealAction, acceptBackgroundCheckAppealAction, denyAppealAction, denyBackgroundCheckAppealAction } from '../../actions'

function DecisionButton({ label, primary }: { label: string; primary?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        primary
          ? 'text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition-opacity hover:opacity-90 whitespace-nowrap disabled:opacity-50'
          : 'text-xs font-medium text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap disabled:opacity-50'
      }
      style={primary ? { backgroundColor: 'var(--color-brand)' } : undefined}
    >
      {label}
    </button>
  )
}

function confirmSubmit(event: React.FormEvent<HTMLFormElement>, message: string) {
  if (!window.confirm(message)) event.preventDefault()
}

const ACTIONS = {
  ban: {
    accept: acceptAppealAction,
    deny: denyAppealAction,
    acceptWarning: 'The ban is lifted and they can sign in again.',
    denyWarning: 'The ban stays and their account is permanently deleted.',
  },
  background_check: {
    accept: acceptBackgroundCheckAppealAction,
    deny: denyBackgroundCheckAppealAction,
    acceptWarning: 'Their background check is approved and they can take bookings once onboarding is done.',
    denyWarning: 'They are banned and their account is permanently deleted.',
  },
}

// `id` is the ban's id, or the cleaner's profile id for a background check appeal.
export default function AppealDecision({ kind, id, name }: { kind: keyof typeof ACTIONS; id: string; name: string }) {
  const actions = ACTIONS[kind]
  const [acceptState, accept] = useActionState(actions.accept.bind(null, id), {})
  const [denyState, deny] = useActionState(actions.deny.bind(null, id), {})
  const state = denyState.message || denyState.error ? denyState : acceptState

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <form action={accept} onSubmit={event => confirmSubmit(event, `Accept ${name}'s appeal? ${actions.acceptWarning}`)}>
          <DecisionButton label="Accept" primary />
        </form>
        <form action={deny} onSubmit={event => confirmSubmit(event, `Deny ${name}'s appeal? ${actions.denyWarning}`)}>
          <DecisionButton label="Deny" />
        </form>
      </div>
      {state.error && <p role="alert" className="text-xs text-red-600 max-w-56">{state.error}</p>}
      {state.message && <p role="status" className="text-xs text-green-600 max-w-56">{state.message}</p>}
    </div>
  )
}
