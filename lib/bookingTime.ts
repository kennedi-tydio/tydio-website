// A booking's date and time are stored as the customer sees them, alongside the customer's
// timezone from when they booked, which makes the customer's time the source of truth.
// Anything comparing them to the current moment has to use that zone, and a cleaner
// elsewhere sees the same moment converted into their own.
export const DEFAULT_BOOKING_TIME_ZONE = 'America/New_York'

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') }
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  const asIfUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000
}

export function bookingStartInstant(date: string, time: string, timeZone: string = DEFAULT_BOOKING_TIME_ZONE): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute)
  // Checked twice so a booking near a daylight saving change gets that day's offset.
  const firstGuess = asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone)
  return new Date(asIfUtc - zoneOffsetMs(new Date(firstGuess), timeZone))
}

export function hasBookingStarted(
  date: string | null,
  time: string | null,
  now: Date = new Date(),
  timeZone: string | null = DEFAULT_BOOKING_TIME_ZONE
): boolean {
  if (!date || !time) return false
  return bookingStartInstant(date, time, timeZone ?? DEFAULT_BOOKING_TIME_ZONE).getTime() <= now.getTime()
}

// Today's date, as someone in that zone would read it.
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  const p = zonedParts(now, timeZone)
  return `${p.year}-${p.month}-${p.day}`
}

// The same booking moment, as it reads in the viewer's zone. Dates can shift too: a late
// evening booking on the east coast is still the day before further west.
export function scheduleForViewer<D extends string | null, T extends string | null>(
  date: D,
  time: T,
  bookingTimeZone: string | null,
  viewerTimeZone: string | null
): { date: D | string; time: T | string; converted: boolean } {
  const from = bookingTimeZone ?? DEFAULT_BOOKING_TIME_ZONE
  const to = viewerTimeZone ?? from
  if (!date || !time || !isValidTimeZone(to)) return { date, time, converted: false }

  const instant = bookingStartInstant(date, time, from)
  const p = zonedParts(instant, to)
  const viewerDate = `${p.year}-${p.month}-${p.day}`
  const viewerTime = `${p.hour}:${p.minute}`
  return { date: viewerDate, time: viewerTime, converted: viewerDate !== date || viewerTime !== time.slice(0, 5) }
}

// A booking has to be accepted at least this long before it starts. So a 10am booking not
// accepted by 9am is canceled at 9am.
export const ACCEPTANCE_CUTOFF_MINUTES = 60

export function hasAcceptanceWindowClosed(
  date: string | null,
  time: string | null,
  now: Date = new Date(),
  timeZone: string | null = DEFAULT_BOOKING_TIME_ZONE
): boolean {
  return hasBookingStarted(date, time, new Date(now.getTime() + ACCEPTANCE_CUTOFF_MINUTES * 60 * 1000), timeZone)
}

export function shiftDateISO(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function hourInZone(timeZone: string, now: Date = new Date()): number {
  return Number(zonedParts(now, timeZone).hour)
}

// A customer canceling an accepted booking this close to its start only gets part of
// their payment back (see lateCancelRefund).
export const LATE_CANCEL_WINDOW_HOURS = 12

export function isLateCancellation(
  date: string | null,
  time: string | null,
  now: Date = new Date(),
  timeZone: string | null = DEFAULT_BOOKING_TIME_ZONE
): boolean {
  return hasBookingStarted(date, time, new Date(now.getTime() + LATE_CANCEL_WINDOW_HOURS * 60 * 60 * 1000), timeZone)
}

// A cleaner who can't get in waits this long, from the start time or when they arrived,
// whichever is later, before they can report "Customer unavailable — no access". An
// "anytime" booking has no start time, so the wait runs from their arrival.
export const NO_ACCESS_WAIT_MINUTES = 15

export function noAccessReportableAt(
  date: string | null,
  time: string | null,
  arrivedAt: string | null,
  timeZone: string | null = DEFAULT_BOOKING_TIME_ZONE
): Date | null {
  const starts = [
    date && time ? bookingStartInstant(date, time, timeZone ?? DEFAULT_BOOKING_TIME_ZONE).getTime() : null,
    arrivedAt ? new Date(arrivedAt).getTime() : null,
  ].filter((t): t is number => t != null)
  if (starts.length === 0) return null
  return new Date(Math.max(...starts) + NO_ACCESS_WAIT_MINUTES * 60 * 1000)
}

export function canReportNoAccess(
  date: string | null,
  time: string | null,
  arrivedAt: string | null,
  now: Date = new Date(),
  timeZone: string | null = DEFAULT_BOOKING_TIME_ZONE
): boolean {
  const at = noAccessReportableAt(date, time, arrivedAt, timeZone)
  return at != null && at.getTime() <= now.getTime()
}

// A customer whose cleaner still hasn't arrived this long after the start time can report
// a no-show. "Anytime" bookings have no start time to measure from.
export const NO_SHOW_REPORT_AFTER_MINUTES = 30

export function noShowReportableAt(
  date: string | null,
  time: string | null,
  timeZone: string | null = DEFAULT_BOOKING_TIME_ZONE
): Date | null {
  if (!date || !time) return null
  return new Date(bookingStartInstant(date, time, timeZone ?? DEFAULT_BOOKING_TIME_ZONE).getTime() + NO_SHOW_REPORT_AFTER_MINUTES * 60 * 1000)
}

export function canReportNoShow(
  date: string | null,
  time: string | null,
  now: Date = new Date(),
  timeZone: string | null = DEFAULT_BOOKING_TIME_ZONE
): boolean {
  const at = noShowReportableAt(date, time, timeZone)
  return at != null && at.getTime() <= now.getTime()
}
