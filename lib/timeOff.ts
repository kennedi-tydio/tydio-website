// Time a Tidy Pro has marked themselves unavailable, on top of their weekly hours: a
// vacation, an appointment, a single day off. Dates are "YYYY-MM-DD" and times "HH:MM",
// both in the cleaner's own calendar, the same way bookings store their date and time.
// Stored on tidypro_profiles.time_off (see 056_tidypro_time_off).
//
// Without times, a range is whole days, inclusive ("all day"). With times, it runs
// from startTime on the start date to endTime on the end date, so a single afternoon
// is { start: d, end: d, startTime: '13:00', endTime: '17:00' }.

export type TimeOffRange = { start: string; end: string; startTime?: string; endTime?: string }

// Plenty for a year of odd days off, while keeping the column small.
export const MAX_TIME_OFF_RANGES = 60

const DAY_MINUTES = 24 * 60
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && HH_MM.test(value)
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function isAllDay(range: TimeOffRange): boolean {
  return range.startTime == null || range.endTime == null
}

// Whether a range makes sense: it ends after it starts, and its times, if any, are both set.
export function isValidTimeOffRange(range: TimeOffRange): boolean {
  if (!isValidISODate(range.start) || !isValidISODate(range.end) || range.start > range.end) return false
  if (range.startTime == null && range.endTime == null) return true
  if (!isValidTime(range.startTime) || !isValidTime(range.endTime)) return false
  return range.start < range.end || range.startTime < range.endTime
}

// Whatever is in the column, as a clean list. Anything malformed is dropped rather than
// trusted, so a bad row can never block (or unblock) the wrong days.
export function parseTimeOff(value: unknown): TimeOffRange[] {
  if (!Array.isArray(value)) return []
  const ranges: TimeOffRange[] = []
  for (const r of value) {
    if (r == null || typeof r !== 'object') continue
    const { start, end, startTime, endTime } = r as Record<string, unknown>
    const range: TimeOffRange =
      startTime == null && endTime == null
        ? { start: start as string, end: end as string }
        : { start: start as string, end: end as string, startTime: startTime as string, endTime: endTime as string }
    if (isValidTimeOffRange(range)) ranges.push(range)
  }
  return ranges
}

// The stretches of a date (minutes since midnight, end exclusive) that time off covers.
export function timeOffBlocksOn(timeOff: TimeOffRange[], dateISO: string): { start: number; end: number }[] {
  const blocks: { start: number; end: number }[] = []
  for (const r of timeOff) {
    if (dateISO < r.start || dateISO > r.end) continue
    if (isAllDay(r)) {
      blocks.push({ start: 0, end: DAY_MINUTES })
      continue
    }
    const start = dateISO === r.start ? toMinutes(r.startTime!) : 0
    const end = dateISO === r.end ? toMinutes(r.endTime!) : DAY_MINUTES
    if (end > start) blocks.push({ start, end })
  }
  return blocks
}

// Whether the whole date is off, so the cleaner has no time to offer that day at all.
// Part-day time off doesn't count: they may still be free the rest of the day.
export function isDateInTimeOff(timeOff: TimeOffRange[], dateISO: string): boolean {
  return timeOffBlocksOn(timeOff, dateISO).some((b) => b.start === 0 && b.end === DAY_MINUTES)
}

// Whether a job starting at `time` on `dateISO` would run into any time off. A job that
// runs past midnight is checked against the next day too.
export function overlapsTimeOff(timeOff: TimeOffRange[], dateISO: string, time: string, durationMinutes: number): boolean {
  const start = toMinutes(time)
  const end = start + durationMinutes
  if (timeOffBlocksOn(timeOff, dateISO).some((b) => start < b.end && b.start < end)) return true
  if (end > DAY_MINUTES) {
    const overflow = end - DAY_MINUTES
    return timeOffBlocksOn(timeOff, nextDayISO(dateISO)).some((b) => b.start < overflow)
  }
  return false
}

function compareRanges(a: TimeOffRange, b: TimeOffRange): number {
  const aKey = `${a.start} ${a.startTime ?? '00:00'}`
  const bKey = `${b.start} ${b.startTime ?? '00:00'}`
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
}

// Ranges that are over are dropped and the rest put in order. Overlapping or back-to-back
// all-day ranges are joined, and repeated ones removed, so the list the cleaner sees stays
// short. Part-day ranges are kept as entered, since joining them could hide what they set.
export function normalizeTimeOff(ranges: TimeOffRange[], todayISO: string): TimeOffRange[] {
  const upcoming = ranges.filter((r) => r.end >= todayISO).sort(compareRanges)

  const merged: TimeOffRange[] = []
  const seen = new Set<string>()
  for (const range of upcoming) {
    if (!isAllDay(range)) {
      const key = `${range.start}|${range.end}|${range.startTime}|${range.endTime}`
      if (!seen.has(key)) merged.push({ ...range })
      seen.add(key)
      continue
    }
    const last = [...merged].reverse().find(isAllDay)
    if (last && range.start <= nextDayISO(last.end)) {
      if (range.end > last.end) last.end = range.end
    } else {
      merged.push({ start: range.start, end: range.end })
    }
  }
  return merged.sort(compareRanges)
}

export function sameTimeOffRange(a: TimeOffRange, b: TimeOffRange): boolean {
  return a.start === b.start && a.end === b.end && (a.startTime ?? null) === (b.startTime ?? null) && (a.endTime ?? null) === (b.endTime ?? null)
}

function nextDayISO(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
