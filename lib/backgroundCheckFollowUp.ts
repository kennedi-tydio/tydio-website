// The reminders an admin can send a stalled cleaner, kept apart from
// lib/backgroundCheck.ts so the admin page's client form can import them.
export const FOLLOW_UP_KINDS = ['not_paid', 'not_started'] as const
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number]

export const FOLLOW_UP_LABELS: Record<FollowUpKind, string> = {
  not_paid: 'Background check not paid for',
  not_started: 'Background check not started',
}
