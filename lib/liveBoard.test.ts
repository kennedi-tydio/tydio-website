import { describe, expect, it } from 'vitest'
import { liveCard, type LiveBooking } from './liveBoard'

// 10:00 in New York on Nov 3 is 15:00 UTC.
const booking: LiveBooking = {
  status: 'scheduled',
  progress_status: null,
  scheduled_date: '2026-11-03',
  scheduled_time: '10:00:00',
  time_zone: 'America/New_York',
  cleaner_marked_complete_at: null,
}
const at = (time: string) => new Date(`2026-11-03T${time}Z`)

describe('liveCard', () => {
  it('leaves a booking off until an hour before it starts', () => {
    expect(liveCard(booking, at('13:59:00'))).toBeNull()
    expect(liveCard(booking, at('14:00:00'))).toMatchObject({ stage: 'on_the_way', onTrack: true, notOnTheWayYet: true })
  })

  it('shows a booking the Tidy Pro is already on the way to, even early', () => {
    expect(liveCard({ ...booking, progress_status: 'on_the_way' }, at('13:00:00'))).toMatchObject({ stage: 'on_the_way', onTrack: true, notOnTheWayYet: false })
  })

  it('turns red at the start time if the Tidy Pro has not arrived', () => {
    expect(liveCard({ ...booking, progress_status: 'on_the_way' }, at('14:59:00'))?.onTrack).toBe(true)
    expect(liveCard({ ...booking, progress_status: 'on_the_way' }, at('15:00:00'))).toMatchObject({ onTrack: false, lateMinutes: 0 })
    expect(liveCard(booking, at('15:12:30'))).toMatchObject({ stage: 'on_the_way', onTrack: false, lateMinutes: 12, notOnTheWayYet: true })
  })

  it('moves across the board with each stage, green once arrived', () => {
    expect(liveCard({ ...booking, progress_status: 'arrived' }, at('15:30:00'))).toMatchObject({ stage: 'arrived', onTrack: true })
    expect(liveCard({ ...booking, progress_status: 'cleaning' }, at('15:30:00'))).toMatchObject({ stage: 'cleaning', onTrack: true })
    expect(liveCard({ ...booking, progress_status: 'done' }, at('17:00:00'))?.stage).toBe('completed')
  })

  it('keeps completed bookings for 12 hours', () => {
    const done = { ...booking, status: 'completed', progress_status: 'done', cleaner_marked_complete_at: '2026-11-03T17:00:00Z' }
    expect(liveCard(done, at('23:00:00'))?.stage).toBe('completed')
    expect(liveCard(done, new Date('2026-11-04T05:01:00Z'))).toBeNull()
  })

  it('drops a booking nobody started 12 hours after its start', () => {
    expect(liveCard(booking, new Date('2026-11-04T03:00:00Z'))?.onTrack).toBe(false)
    expect(liveCard(booking, new Date('2026-11-04T03:01:00Z'))).toBeNull()
  })

  it('ignores canceled and pending bookings, and anytime bookings not yet started', () => {
    expect(liveCard({ ...booking, status: 'cancelled' }, at('14:30:00'))).toBeNull()
    expect(liveCard({ ...booking, status: 'pending' }, at('14:30:00'))).toBeNull()
    expect(liveCard({ ...booking, scheduled_time: null }, at('14:30:00'))).toBeNull()
    expect(liveCard({ ...booking, scheduled_time: null, progress_status: 'on_the_way' }, at('14:30:00'))).toMatchObject({ onTrack: true })
  })
})
