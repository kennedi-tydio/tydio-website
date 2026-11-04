/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const create = vi.fn<(call: Record<string, unknown>) => Promise<object>>(async () => ({ sid: 'CA1', status: 'queued' }))
vi.mock('twilio', () => ({ default: () => ({ calls: { create: (call: Record<string, unknown>) => create(call) } }) }))

let rateLimited = false
const recordRateLimitEvent = vi.fn(async () => {})
vi.mock('@/lib/rateLimit', () => ({
  RATE_LIMITS: { maskedCallPerBooking: { limit: 1, windowMinutes: 1 } },
  isRateLimited: async () => rateLimited,
  recordRateLimitEvent: () => recordRateLimitEvent(),
}))

const rows: Record<string, Record<string, any>[]> = {}
const inserted: Record<string, any>[] = []
const fakeAdmin = {
  from: (table: string) => {
    const filters: [string, unknown][] = []
    const chain: any = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return chain
      },
      maybeSingle: async () => ({ data: rows[table].find(r => filters.every(([c, v]) => r[c] === v)) ?? null }),
      insert: async (row: Record<string, any>) => {
        inserted.push(row)
        return { error: null }
      },
    }
    return chain
  },
} as any

import { canCall, startMaskedCall, toE164 } from './maskedCalls'

// 10:00 in New York on June 1, 2026 is 14:00 UTC.
const booking = {
  id: 'b1',
  user_id: 'c1',
  tidy_pro_id: 't1',
  status: 'scheduled',
  scheduled_date: '2026-06-01',
  scheduled_time: '10:00',
  estimated_duration_minutes: 60,
  time_zone: 'America/New_York',
}

beforeEach(() => {
  rows.bookings = [{ ...booking }]
  rows.profiles = [{ id: 'c1', phone: '(555) 123-4567' }]
  rows.tidypro_profiles = [{ id: 't1', phone: '555-999-0000' }]
  inserted.length = 0
  rateLimited = false
  create.mockClear()
  recordRateLimitEvent.mockClear()
  process.env.TWILIO_ACCOUNT_SID = 'AC1'
  process.env.TWILIO_AUTH_TOKEN = 'token'
  process.env.TWILIO_PHONE_NUMBER = '+15550000000'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://tydio.example/'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-01T13:00:00Z'))
})

describe('canCall', () => {
  it('allows calls on an accepted booking until 2 hours after it ends', () => {
    expect(canCall(booking, new Date('2026-05-30T12:00:00Z'))).toBe(true)
    expect(canCall(booking, new Date('2026-06-01T17:00:00Z'))).toBe(true)
    expect(canCall({ ...booking, status: 'completed' }, new Date('2026-06-01T16:30:00Z'))).toBe(true)
    expect(canCall(booking, new Date('2026-06-01T17:01:00Z'))).toBe(false)
  })

  it('refuses requests nobody has accepted and canceled bookings', () => {
    const now = new Date('2026-06-01T13:00:00Z')
    expect(canCall({ ...booking, status: 'pending' }, now)).toBe(false)
    expect(canCall({ ...booking, status: 'cancelled' }, now)).toBe(false)
    expect(canCall({ ...booking, tidy_pro_id: null }, now)).toBe(false)
  })
})

describe('toE164', () => {
  it('formats US numbers however they were typed', () => {
    expect(toE164('(555) 123-4567')).toBe('+15551234567')
    expect(toE164('1-555-123-4567')).toBe('+15551234567')
    expect(toE164('+44 20 7946 0958')).toBe('+442079460958')
    expect(toE164('12345')).toBeNull()
    expect(toE164(null)).toBeNull()
  })
})

describe('startMaskedCall', () => {
  it("rings the caller from Tydio's number without putting the other side's number anywhere", async () => {
    expect(await startMaskedCall(fakeAdmin, 'b1', { role: 'USER', profileId: 'c1' })).toEqual({ success: true })
    expect(create).toHaveBeenCalledTimes(1)
    const call = create.mock.calls[0][0]
    expect(call.to).toBe('+15551234567')
    expect(call.from).toBe('+15550000000')
    expect(call.url).toBe('https://tydio.example/api/webhooks/twilio/voice?booking=b1&leg=USER')
    expect(JSON.stringify(call)).not.toContain('5559990000')
    expect(inserted).toEqual([{ booking_id: 'b1', caller_role: 'USER', twilio_call_sid: 'CA1', status: 'queued' }])
    expect(recordRateLimitEvent).toHaveBeenCalled()
  })

  it("dials the Tidy Pro's own phone when they're the one calling", async () => {
    await startMaskedCall(fakeAdmin, 'b1', { role: 'TIDYPRO', profileId: 't1' })
    expect(create.mock.calls[0][0].to).toBe('+15559990000')
  })

  it("refuses someone else's booking", async () => {
    expect(await startMaskedCall(fakeAdmin, 'b1', { role: 'USER', profileId: 'c2' })).toEqual({ error: 'Booking not found.' })
    expect(await startMaskedCall(fakeAdmin, 'b1', { role: 'TIDYPRO', profileId: 't2' })).toEqual({ error: 'Booking not found.' })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses outside the call window', async () => {
    vi.setSystemTime(new Date('2026-06-01T18:00:00Z'))
    expect(await startMaskedCall(fakeAdmin, 'b1', { role: 'USER', profileId: 'c1' })).toHaveProperty('error')
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses when either side has no usable phone', async () => {
    rows.tidypro_profiles[0].phone = null
    expect(await startMaskedCall(fakeAdmin, 'b1', { role: 'USER', profileId: 'c1' })).toEqual({
      error: "Your Tidy Pro doesn't have a phone number we can call. Send them a message instead.",
    })
    rows.profiles[0].phone = ''
    expect(await startMaskedCall(fakeAdmin, 'b1', { role: 'USER', profileId: 'c1' })).toEqual({
      error: 'Add a phone number to your profile to make calls.',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a second call within the rate limit', async () => {
    rateLimited = true
    expect(await startMaskedCall(fakeAdmin, 'b1', { role: 'USER', profileId: 'c1' })).toHaveProperty('error')
    expect(create).not.toHaveBeenCalled()
  })

  it("doesn't count a call Twilio failed to start", async () => {
    create.mockRejectedValueOnce(new Error('Invalid number'))
    expect(await startMaskedCall(fakeAdmin, 'b1', { role: 'USER', profileId: 'c1' })).toEqual({
      error: "We couldn't start the call. Please try again.",
    })
    expect(recordRateLimitEvent).not.toHaveBeenCalled()
  })
})
