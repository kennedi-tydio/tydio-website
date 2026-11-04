'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { manageAccountsAction, type AccountActionState } from '../../actions'

// The row checkboxes sit in the table, outside this form, and join it through
// their `form` attribute, so they don't clash with each row's own forms.
const BULK_FORM_ID = 'bulk-account-actions'
const ROW_CHECKBOXES = `input[type="checkbox"][name="ids"][form="${BULK_FORM_ID}"]`

function rowCheckboxes(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(ROW_CHECKBOXES))
}

// Recounts on every checkbox change, including ones made by Select all.
function useSelection(): { count: number; total: number } {
  const [selection, setSelection] = useState({ count: 0, total: 0 })
  useEffect(() => {
    const recount = () => {
      const boxes = rowCheckboxes()
      setSelection({ count: boxes.filter(box => box.checked).length, total: boxes.length })
    }
    recount()
    document.addEventListener('change', recount)
    return () => document.removeEventListener('change', recount)
  }, [])
  return selection
}

function setAllChecked(checked: boolean) {
  for (const box of rowCheckboxes()) box.checked = checked
  document.dispatchEvent(new Event('change'))
}

function confirmIntent(event: React.MouseEvent<HTMLButtonElement>, message: string) {
  if (!window.confirm(message)) event.preventDefault()
}

function deleteWarning(what: string): string {
  return `Permanently delete ${what}? Their profile, addresses, saved cards and bookings are erased and can't be recovered. Anyone with an open booking or an unpaid payout will be skipped.`
}

// Asks for an optional reason, shown on the Banned list, and passes it in the form's
// `note` field. Cancelling the prompt cancels the ban.
function askBanReason(event: React.MouseEvent<HTMLButtonElement>, what: string) {
  const reason = window.prompt(
    `Ban ${what}? They're signed out, can't sign in or sign up again with the same email or phone, and are emailed a link to appeal. Their account is deleted 7 days after the ban unless you accept an appeal first, or as soon as you deny one.

Reason (optional, included in the email and shown on the Banned list):`,
    ''
  )
  if (reason === null) {
    event.preventDefault()
    return
  }
  const note = event.currentTarget.form?.elements.namedItem('note')
  if (note instanceof HTMLInputElement) note.value = reason
}

function ResultMessage({ state }: { state: AccountActionState }) {
  if (state.error) return <p role="alert" className="text-xs text-red-600">{state.error}</p>
  if (state.message) return <p role="status" className="text-xs text-green-600">{state.message}</p>
  return null
}

function IntentButton({
  intent,
  label,
  disabled,
  confirmMessage,
  danger,
  onClick,
}: {
  intent: 'suspend' | 'unsuspend' | 'delete' | 'ban'
  label: string
  disabled?: boolean
  confirmMessage?: string
  danger?: boolean
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      name="intent"
      value={intent}
      disabled={pending || disabled}
      onClick={onClick ?? (confirmMessage ? event => confirmIntent(event, confirmMessage) : undefined)}
      className={`text-xs font-medium border px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? 'text-red-600 border-red-200 hover:bg-red-50'
          : 'text-slate-500 border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
      }`}
    >
      {label}
    </button>
  )
}

export function SelectAllAccounts() {
  const { count, total } = useSelection()
  const ref = useRef<HTMLInputElement>(null)
  const allChecked = total > 0 && count === total
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !allChecked
  }, [count, allChecked])

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all users"
      checked={allChecked}
      onChange={event => setAllChecked(event.target.checked)}
      className="accent-brand"
    />
  )
}

export function BulkAccountActions() {
  const [state, action] = useActionState(manageAccountsAction, {})
  const { count } = useSelection()

  // Clear the selection once an action finishes, so nothing is acted on twice.
  useEffect(() => {
    if (state.message || state.error) setAllChecked(false)
  }, [state])

  const selected = `${count} selected account${count === 1 ? '' : 's'}`
  return (
    <form id={BULK_FORM_ID} action={action} className="flex flex-wrap items-center gap-2 mb-4 min-h-8">
      <input type="hidden" name="note" />
      <span className="text-sm text-slate-500">{count > 0 ? `${count} selected` : 'Select users to act on several at once'}</span>
      {count > 0 && (
        <>
          <IntentButton intent="suspend" label="Suspend" confirmMessage={`Suspend ${selected}? They can still sign in, but can't book or take bookings until unsuspended.`} />
          <IntentButton intent="unsuspend" label="Unsuspend" />
          <IntentButton intent="delete" label="Delete" danger confirmMessage={deleteWarning(selected)} />
          <IntentButton intent="ban" label="Ban" danger onClick={event => askBanReason(event, selected)} />
          <button type="button" onClick={() => setAllChecked(false)} className="text-xs text-slate-400 hover:text-slate-600 px-1">
            Clear selection
          </button>
        </>
      )}
      <ResultMessage state={state} />
    </form>
  )
}

export function RowSelectCheckbox({ profileId, label }: { profileId: string; label: string }) {
  return (
    <input
      type="checkbox"
      name="ids"
      value={profileId}
      form={BULK_FORM_ID}
      aria-label={`Select ${label}`}
      className="accent-brand"
    />
  )
}

// A banned account's fate is decided on the Appeals page, so only Delete is offered here.
export function RowAccountActions({
  profileId,
  name,
  suspended,
  banned,
}: {
  profileId: string
  name: string
  suspended: boolean
  banned: boolean
}) {
  const [state, action] = useActionState(manageAccountsAction, {})
  return (
    <form action={action} className="mt-1.5">
      <input type="hidden" name="ids" value={profileId} />
      <input type="hidden" name="note" />
      <div className="flex items-center gap-2">
        {!banned && (suspended ? (
          <IntentButton intent="unsuspend" label="Unsuspend" />
        ) : (
          <IntentButton intent="suspend" label="Suspend" confirmMessage={`Suspend ${name}? They can still sign in, but can't book or take bookings until unsuspended.`} />
        ))}
        <IntentButton intent="delete" label="Delete" danger confirmMessage={deleteWarning(name)} />
        {!banned && <IntentButton intent="ban" label="Ban" danger onClick={event => askBanReason(event, name)} />}
      </div>
      <div className="mt-1 max-w-56">
        <ResultMessage state={state} />
      </div>
    </form>
  )
}
