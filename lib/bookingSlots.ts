import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import { timeOffBlocksOn, type TimeOffRange } from '@/lib/timeOff'

// The start times a Tidy Pro can offer for a job, and the date and time ranges a
// customer can search with. Search (findAvailableCleaners) and the "Choose a time"
// calendar both use these, so a Tidy Pro shown for a range always has a time in it.
//
// A customer's range is a set of acceptable *start* times: "Nov 20 – Nov 25, starting
// between 9:00 AM and 1:00 PM". The booking itself still gets one date and start time.

export const SLOT_STEP_MINUTES = 30
// The longest date range a customer can search, inclusive of both ends.
export const MAX_DATE_RANGE_DAYS = 31

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type Busy = { start: number; end: number }
export type StartWindow = { start: string; end: string } // "HH:MM", both ends allowed

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function toTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function weekdayOf(dateISO: string): (typeof WEEKDAYS)[number] {
  const [y, m, d] = dateISO.split('-').map(Number)
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// Every date from start to end, both included.
export function datesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  for (let d = start; d <= end && dates.length < MAX_DATE_RANGE_DAYS; d = addDaysISO(d, 1)) dates.push(d)
  return dates
}

export function dateRangeDays(start: string, end: string): number {
  const [ay, am, ad] = start.split('-').map(Number)
  const [by, bm, bd] = end.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000) + 1
}

// Start times, in SLOT_STEP_MINUTES steps, where the whole job fits inside one of the
// day's blocks of working hours and misses everything busy. Without a window, steps
// run from each block's start. With one, from the later of the block's start and the
// window's, and no later than the window's end.
export function startTimesInBlocks(opts: {
  blocks: { start: string; end: string }[]
  durationMinutes: number
  busy?: Busy[]
  earliestStart?: number
  window?: StartWindow | null
}): string[] {
  const busy = opts.busy ?? []
  const earliest = opts.earliestStart ?? 0
  const windowStart = opts.window ? toMinutes(opts.window.start) : null
  const windowEnd = opts.window ? toMinutes(opts.window.end) : null

  const times = new Set<string>()
  for (const block of opts.blocks) {
    const blockStart = toMinutes(block.start)
    const blockEnd = toMinutes(block.end)
    const first = windowStart != null ? Math.max(blockStart, windowStart) : blockStart
    for (let t = first; t + opts.durationMinutes <= blockEnd; t += SLOT_STEP_MINUTES) {
      if (windowEnd != null && t > windowEnd) break
      if (t < earliest) continue
      const end = t + opts.durationMinutes
      if (!busy.some((b) => t < b.end && b.start < end)) times.add(toTime(t))
    }
  }
  return Array.from(times).sort()
}

// The start times open on a date: their weekly hours that weekday, less time off and
// bookings already on their calendar.
export function openStartTimes(opts: {
  availability: WeeklyAvailability
  timeOff: TimeOffRange[]
  dateISO: string
  durationMinutes: number
  bookings?: Busy[]
  earliestStart?: number
  window?: StartWindow | null
}): string[] {
  const blocks = opts.availability[weekdayOf(opts.dateISO)] ?? []
  if (blocks.length === 0) return []
  return startTimesInBlocks({
    blocks,
    durationMinutes: opts.durationMinutes,
    busy: [...(opts.bookings ?? []), ...timeOffBlocksOn(opts.timeOff, opts.dateISO)],
    earliestStart: opts.earliestStart,
    window: opts.window,
  })
}

// "Any day" with a time window: their hours allow a start in the window on some weekday.
// There's no date yet, so bookings and time off aren't checked until one is chosen.
export function hasStartInWindowOnSomeWeekday(
  availability: WeeklyAvailability,
  durationMinutes: number,
  window: StartWindow
): boolean {
  return WEEKDAYS.some((w) => startTimesInBlocks({ blocks: availability[w] ?? [], durationMinutes, window }).length > 0)
}

export interface ScheduleRange {
  date: string | null
  endDate: string | null
  time: string | null
  endTime: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// Drops a range end that doesn't make sense, so a range is only ever stored with a
// start before its end: a date range needs a start date, a time window a start time.
// A date range longer than MAX_DATE_RANGE_DAYS is cut to that length.
export function normalizeScheduleRange(r: ScheduleRange): ScheduleRange {
  const date = r.date && ISO_DATE.test(r.date) ? r.date : null
  const time = r.time && HHMM.test(r.time) ? r.time : null
  let endDate = date && r.endDate && ISO_DATE.test(r.endDate) && r.endDate > date ? r.endDate : null
  if (date && endDate && dateRangeDays(date, endDate) > MAX_DATE_RANGE_DAYS) endDate = addDaysISO(date, MAX_DATE_RANGE_DAYS - 1)
  const endTime = time && r.endTime && HHMM.test(r.endTime) && r.endTime > time ? r.endTime : null
  return { date, endDate, time, endTime }
}
