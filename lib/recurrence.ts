import { shiftDateISO } from '@/lib/bookingTime'

// How often a recurring booking repeats. Pure helpers, safe on the client; the series
// itself lives in lib/recurringBookings.

export const RECURRENCE_FREQUENCIES = ['weekly', 'biweekly', 'every_4_weeks'] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

// Each next visit is booked this many days ahead, so the Tidy Pro has time to accept.
export const RECURRING_LEAD_DAYS = 7

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
}

export function recurrenceIntervalDays(frequency: RecurrenceFrequency): number {
  return frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 28
}

export function recurrenceLabel(frequency: RecurrenceFrequency): string {
  return frequency === 'weekly' ? 'Every week' : frequency === 'biweekly' ? 'Every 2 weeks' : 'Every 4 weeks'
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Every visit lands on the same weekday and time as the first, e.g. "Every Sunday at
// 9:00 AM". Falls back to recurrenceLabel when the first visit's date or time is unknown.
export function recurrenceScheduleLabel(frequency: RecurrenceFrequency, date: string | null, time: string | null): string {
  if (!date || !time) return recurrenceLabel(frequency)
  const [y, m, d] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const [hour, minute] = time.split(':').map(Number)
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
  if (frequency === 'weekly') return `Every ${weekday} at ${clock}`
  if (frequency === 'biweekly') return `Every other ${weekday} at ${clock}`
  return `Every 4 weeks on ${weekday} at ${clock}`
}

// One visit, e.g. "Sun, Nov 29 · 9:00 AM".
const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function occurrenceLabel(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  const [hour, minute] = time.split(':').map(Number)
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
  return `${SHORT_WEEKDAYS[day.getUTCDay()]}, ${SHORT_MONTHS[day.getUTCMonth()]} ${day.getUTCDate()} · ${clock}`
}

export function nextVisitDate(date: string, frequency: RecurrenceFrequency): string {
  return shiftDateISO(date, recurrenceIntervalDays(frequency))
}

// Whether the visit on `nextDate` should be booked now.
export function isVisitDue(nextDate: string, todayISO: string): boolean {
  return nextDate <= shiftDateISO(todayISO, RECURRING_LEAD_DAYS)
}

// ── Paying for visits of an accepted series (see lib/recurringPayments) ──
// The Tidy Pro accepts the whole series with its first visit, so each later visit goes
// on their schedule unpaid, and the card is charged this long before it starts.
export const RECURRING_CHARGE_DAYS_BEFORE = 3
// A failed charge is tried again this often until the cutoff.
export const RECURRING_RETRY_HOURS = 24
// Still unpaid this close to the start, the visit is suspended: the customer has to pay
// and choose a new date, or it's canceled at its original start.
export const RECURRING_PAYMENT_CUTOFF_HOURS = 24

const HOUR_MS = 60 * 60 * 1000

export function recurringPaymentDueAt(start: Date): Date {
  return new Date(start.getTime() - RECURRING_CHARGE_DAYS_BEFORE * 24 * HOUR_MS)
}

export function recurringPaymentCutoff(start: Date): Date {
  return new Date(start.getTime() - RECURRING_PAYMENT_CUTOFF_HOURS * HOUR_MS)
}

export type UnpaidVisitState = {
  start: Date
  paymentDueAt: Date
  attemptedAt: Date | null
  suspended: boolean
}

// What the scheduled job does with an unpaid visit right now:
//   cancel   its start time came with it still unpaid
//   wait     suspended (the customer has to act), or not due to be tried yet
//   charge   due: the first try, a retry a day after the last, or the last try at the cutoff
export function unpaidVisitAction(visit: UnpaidVisitState, now: Date): 'cancel' | 'wait' | 'charge' {
  if (now.getTime() >= visit.start.getTime()) return 'cancel'
  if (visit.suspended) return 'wait'
  if (now.getTime() < visit.paymentDueAt.getTime()) return 'wait'
  if (!visit.attemptedAt) return 'charge'
  const cutoff = recurringPaymentCutoff(visit.start)
  if (now.getTime() >= cutoff.getTime() && visit.attemptedAt.getTime() < cutoff.getTime()) return 'charge'
  return now.getTime() - visit.attemptedAt.getTime() >= RECURRING_RETRY_HOURS * HOUR_MS ? 'charge' : 'wait'
}

// After a failed try: suspended once the cutoff has come.
export function shouldSuspendUnpaidVisit(start: Date, now: Date): boolean {
  return now.getTime() >= recurringPaymentCutoff(start).getTime()
}
