import { parseCancellation, type Cancellation } from './cancellationReasons'

// What a Tidy Pro picks from when declining a booking request. Saved to booking_declines,
// which only admins see (the Bookings tab). Never show these to the customer.
export const DECLINE_REASONS = [
  { id: 'unavailable', label: 'I’m unavailable at that time' },
  { id: 'too_far', label: 'The location is too far away' },
  { id: 'payout_too_low', label: 'The payout is too low for the work' },
  { id: 'service_not_offered', label: 'I don’t offer one or more requested services' },
  { id: 'job_too_large', label: 'The job is too large for me to complete on my own' },
  { id: 'need_more_details', label: 'I need more details to assess the job' },
  { id: 'safety_or_access', label: 'I have a safety or access concern' },
  { id: 'other', label: 'Other' },
] as const

export type Decline = Cancellation

// One reason from the list. Only "Other" takes a note, which is optional and trimmed.
export function parseDecline(input: Decline | null | undefined): { reason: string; note: string | null } | { error: string } {
  if (!DECLINE_REASONS.some((o) => o.id === input?.reason)) return { error: 'Please choose a reason for declining.' }
  const parsed = parseCancellation(DECLINE_REASONS, input)
  if ('error' in parsed) return parsed
  return parsed.reason === 'other' ? parsed : { reason: parsed.reason, note: null }
}

export function declineReasonLabel(id: string | null | undefined): string | null {
  if (!id) return null
  return DECLINE_REASONS.find((o) => o.id === id)?.label ?? id
}
