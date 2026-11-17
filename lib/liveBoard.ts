import { START_BOOKING_WINDOW_MINUTES, bookingStartInstant } from '@/lib/bookingTime'

// The admin Live Board (/admin/live): every booking being worked right now, in a column
// for its stage. A booking joins the board an hour before it starts, in On the way, the
// same moment the Tidy Pro can tap "I'm on the way". It turns red when it has started
// and the Tidy Pro still hasn't tapped "I've arrived".

export const LIVE_STAGES = [
  { key: 'on_the_way', label: 'On the way' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'completed', label: 'Completed' },
] as const

export type LiveStage = (typeof LIVE_STAGES)[number]['key']

// How long a finished booking stays in Completed, and how long a booking nobody started
// stays on the board (red) before it drops off as stale.
export const COMPLETED_VISIBLE_HOURS = 12
export const NOT_STARTED_VISIBLE_HOURS = 12

export type LiveBooking = {
  status: string | null
  progress_status: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  time_zone: string | null
  cleaner_marked_complete_at: string | null
}

export type LiveCard = {
  stage: LiveStage
  onTrack: boolean
  // When it started or starts, if it has a set time.
  startsAt: Date | null
  // Why the card is red, for the note on it.
  lateMinutes: number | null
  // Before the start, the Tidy Pro hasn't tapped "I'm on the way" yet.
  notOnTheWayYet: boolean
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

function startOf(b: LiveBooking): Date | null {
  if (!b.scheduled_date || !b.scheduled_time) return null
  return bookingStartInstant(b.scheduled_date, b.scheduled_time, b.time_zone ?? undefined)
}

// Where a booking sits on the board right now, or null if it isn't on it.
export function liveCard(b: LiveBooking, now: Date): LiveCard | null {
  const startsAt = startOf(b)
  const card = (stage: LiveStage, onTrack = true, lateMinutes: number | null = null, notOnTheWayYet = false): LiveCard => ({
    stage,
    onTrack,
    startsAt,
    lateMinutes,
    notOnTheWayYet,
  })

  if (b.status === 'completed') {
    const doneAt = b.cleaner_marked_complete_at ? new Date(b.cleaner_marked_complete_at).getTime() : null
    return doneAt != null && now.getTime() - doneAt <= COMPLETED_VISIBLE_HOURS * HOUR_MS ? card('completed') : null
  }
  if (b.status !== 'scheduled') return null

  switch (b.progress_status) {
    case 'done':
      return card('completed')
    case 'cleaning':
    case 'in_progress':
      return card('cleaning')
    case 'arrived':
      return card('arrived')
  }

  // Not arrived yet: on the board from an hour before the start until it goes stale.
  // A booking for "anytime" has no start to be late for, so it only shows once the Tidy
  // Pro taps "I'm on the way".
  const onTheWay = b.progress_status === 'on_the_way'
  if (!startsAt) return onTheWay ? card('on_the_way') : null
  const untilStart = startsAt.getTime() - now.getTime()
  if (untilStart > START_BOOKING_WINDOW_MINUTES * MINUTE_MS && !onTheWay) return null
  if (-untilStart > NOT_STARTED_VISIBLE_HOURS * HOUR_MS) return null
  if (untilStart <= 0) return card('on_the_way', false, Math.floor((now.getTime() - startsAt.getTime()) / MINUTE_MS), !onTheWay)
  return card('on_the_way', true, null, !onTheWay)
}
