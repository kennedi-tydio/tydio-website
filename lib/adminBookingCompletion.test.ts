import { describe, expect, it } from 'vitest'
import { canAdminComplete } from './adminBookingCompletion'

const started = { status: 'scheduled', progress_status: 'cleaning', tidy_pro_id: 'pro-1', cleaner_marked_complete_at: null }

describe('canAdminComplete', () => {
  it('allows a booking the Tidy Pro has arrived at or started', () => {
    expect(canAdminComplete(started)).toBe(true)
    expect(canAdminComplete({ ...started, progress_status: 'arrived' })).toBe(true)
  })

  it('refuses one not started, on the way, finished, canceled or without a Tidy Pro', () => {
    expect(canAdminComplete({ ...started, progress_status: null })).toBe(false)
    expect(canAdminComplete({ ...started, progress_status: 'on_the_way' })).toBe(false)
    expect(canAdminComplete({ ...started, progress_status: 'done' })).toBe(false)
    expect(canAdminComplete({ ...started, cleaner_marked_complete_at: '2026-11-22T18:00:00Z' })).toBe(false)
    expect(canAdminComplete({ ...started, status: 'cancelled' })).toBe(false)
    expect(canAdminComplete({ ...started, tidy_pro_id: null })).toBe(false)
  })
})
