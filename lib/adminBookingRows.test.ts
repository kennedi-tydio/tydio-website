import { describe, expect, it } from 'vitest'
import { oneRowPerRequest, prosAskedByRow } from './adminBookingRows'

describe('oneRowPerRequest', () => {
  it('keeps bookings that were never part of a group', () => {
    const rows = [{ id: 'a', request_group_id: null }, { id: 'b', request_group_id: null }]
    expect(oneRowPerRequest(rows, []).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it("shows an initial request once: the customer's booking, not its copies", () => {
    // An initial group's primary booking is taken out of the group when it closes.
    const rows = [
      { id: 'copy1', request_group_id: 'g' },
      { id: 'primary', request_group_id: null },
      { id: 'copy2', request_group_id: 'g' },
    ]
    const groups = [{ id: 'g', original_booking_id: null, primary_booking_id: 'primary' }]
    expect(oneRowPerRequest(rows, groups).map((r) => r.id)).toEqual(['primary'])
  })

  it("keeps one copy when the customer's booking isn't listed", () => {
    const rows = [{ id: 'copy1', request_group_id: 'g' }, { id: 'copy2', request_group_id: 'g' }]
    const groups = [{ id: 'g', original_booking_id: 'orig', primary_booking_id: null }]
    expect(oneRowPerRequest(rows, groups).map((r) => r.id)).toEqual(['copy1'])
  })

  it('keeps the original when it is itself in the group', () => {
    const rows = [{ id: 'copy1', request_group_id: 'g' }, { id: 'orig', request_group_id: 'g' }]
    const groups = [{ id: 'g', original_booking_id: 'orig', primary_booking_id: null }]
    expect(oneRowPerRequest(rows, groups).map((r) => r.id)).toEqual(['orig'])
  })
})

describe('prosAskedByRow', () => {
  it('counts every row in the request, including the customer booking', () => {
    const rows = [
      { id: 'copy1', request_group_id: 'g' },
      { id: 'primary', request_group_id: null },
      { id: 'copy2', request_group_id: 'g' },
      { id: 'solo', request_group_id: null },
    ]
    const groups = [{ id: 'g', original_booking_id: null, primary_booking_id: 'primary' }]
    const kept = oneRowPerRequest(rows, groups)
    const asked = prosAskedByRow(rows, kept, groups)
    expect(asked.get('primary')).toBe(3)
    expect(asked.get('solo')).toBe(1)
  })
})
