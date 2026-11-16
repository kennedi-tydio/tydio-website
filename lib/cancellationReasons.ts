// What a customer or Tidy Pro picks from when canceling a booking, plus an optional note.
// Saved to bookings.cancellation_reason / cancellation_note. Separate from cancelled_reason,
// which is a system code that decides refunds and payouts (e.g. LATE_CANCEL_REASON).
export const CUSTOMER_CANCEL_REASONS = [
  { id: 'plans_changed', label: 'My plans changed' },
  { id: 'wrong_date_time', label: 'I booked the wrong date or time' },
  { id: 'wrong_service', label: 'I booked the wrong task or service' },
  { id: 'no_longer_needed', label: 'I no longer need the cleaning' },
  { id: 'cannot_provide_access', label: 'I can’t provide access at the scheduled time' },
  { id: 'cleaner_asked', label: 'The cleaner asked me to cancel' },
  { id: 'other', label: 'Something else' },
] as const

export const CLEANER_CANCEL_REASONS = [
  { id: 'no_longer_available', label: 'I’m no longer available' },
  { id: 'sick_or_emergency', label: 'I’m sick or have an emergency' },
  { id: 'transportation', label: 'I have a transportation issue' },
  { id: 'accepted_by_mistake', label: 'I accepted the booking by mistake' },
  { id: 'customer_asked', label: 'The customer asked me to cancel' },
  { id: 'job_differs', label: 'The job differs from the booking' },
  { id: 'unsafe', label: 'I can’t safely complete the job' },
  { id: 'other', label: 'Something else' },
] as const

export type CancelReasonOption = { id: string; label: string }

export type Cancellation = { reason: string; note?: string }

export const CANCEL_NOTE_MAX_LENGTH = 500

// Checks what the client sent against the given list. The note is optional and trimmed.
export function parseCancellation(
  options: readonly CancelReasonOption[],
  input: Cancellation | null | undefined
): { reason: string; note: string | null } | { error: string } {
  const reason = options.find((o) => o.id === input?.reason)
  if (!reason) return { error: 'Please choose a reason for canceling.' }
  const note = typeof input?.note === 'string' ? input.note.trim() : ''
  if (note.length > CANCEL_NOTE_MAX_LENGTH) return { error: `Please keep your note under ${CANCEL_NOTE_MAX_LENGTH} characters.` }
  return { reason: reason.id, note: note || null }
}

export function cancelReasonLabel(id: string | null | undefined): string | null {
  if (!id) return null
  return [...CUSTOMER_CANCEL_REASONS, ...CLEANER_CANCEL_REASONS].find((o) => o.id === id)?.label ?? id
}
