// The 7-day appeal window shared by bans and background check denials. Plain helpers
// with no server dependencies, so the appeal form and pure modules can use them.

// How long someone has to get an appeal accepted before their account is closed.
export const BAN_APPEAL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export const APPEAL_MAX_LENGTH = 2000

// For a refusal the person (or admin) should see as-is.
export class BanAppealError extends Error {}

export function appealDeadline(openedAt: string): Date {
  return new Date(new Date(openedAt).getTime() + BAN_APPEAL_DAYS * DAY_MS)
}

// Everything opened before this is past its deadline.
export function appealCutoff(now: Date): string {
  return new Date(now.getTime() - BAN_APPEAL_DAYS * DAY_MS).toISOString()
}

export function formatDeadline(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}
