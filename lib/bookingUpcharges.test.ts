import { describe, expect, it } from 'vitest'
import { parseUpchargeInput, upchargeBlockedReason, upchargeCustomerCharge } from './bookingUpcharges'
import { describeBookingChanges, parseAdminBookingEdit } from './adminBookingEdits'

describe('parseUpchargeInput', () => {
  it('gives the Tidy Pro 80% when their share is left blank', () => {
    expect(parseUpchargeInput('25', '', 'Extra rooms')).toEqual({ amount: 25, cleanerPay: 20, reason: 'Extra rooms' })
  })

  it('accepts dollar signs and a custom share', () => {
    expect(parseUpchargeInput('$30.50', '30.50', ' Deep clean ')).toEqual({ amount: 30.5, cleanerPay: 30.5, reason: 'Deep clean' })
  })

  it('rejects bad amounts, shares over the amount, and a missing reason', () => {
    expect(parseUpchargeInput('0', '', 'x')).toHaveProperty('error')
    expect(parseUpchargeInput('abc', '', 'x')).toHaveProperty('error')
    expect(parseUpchargeInput('10.555', '', 'x')).toHaveProperty('error')
    expect(parseUpchargeInput('1001', '', 'x')).toHaveProperty('error')
    expect(parseUpchargeInput('10', '11', 'x')).toHaveProperty('error')
    expect(parseUpchargeInput('10', '', '   ')).toHaveProperty('error')
    expect(parseUpchargeInput('10', '', 'x'.repeat(501))).toHaveProperty('error')
  })
})

describe('upchargeBlockedReason', () => {
  const open = { status: 'scheduled', progress_status: null, cleaner_marked_complete_at: null, suspended_for_upcharge_at: null, tidy_pro_id: 'pro' }

  it('allows an accepted booking, including one in progress', () => {
    expect(upchargeBlockedReason(open)).toBeNull()
    expect(upchargeBlockedReason({ ...open, progress_status: 'cleaning' })).toBeNull()
  })

  it('blocks requests, finished bookings, and a second upcharge', () => {
    expect(upchargeBlockedReason({ ...open, status: 'pending' })).not.toBeNull()
    expect(upchargeBlockedReason({ ...open, progress_status: 'done' })).not.toBeNull()
    expect(upchargeBlockedReason({ ...open, cleaner_marked_complete_at: '2026-11-14T00:00:00Z' })).not.toBeNull()
    expect(upchargeBlockedReason({ ...open, suspended_for_upcharge_at: '2026-11-14T00:00:00Z' })).not.toBeNull()
  })
})

describe('upchargeCustomerCharge', () => {
  it('adds the card fee on top, like a booking', () => {
    // (25 + 0.30) / (1 - 0.029)
    expect(upchargeCustomerCharge(25, 0.029)).toBe(26.06)
  })
})

describe('parseAdminBookingEdit', () => {
  const fields = { date: '2026-11-18', time: '14:00', durationMinutes: '120', notes: ' Ring twice ', entryInstructions: '' }

  it('trims notes and turns blanks into null', () => {
    expect(parseAdminBookingEdit(fields)).toEqual({ date: '2026-11-18', time: '14:00', durationMinutes: 120, notes: 'Ring twice', entryInstructions: null })
  })

  it('takes a time with seconds', () => {
    expect(parseAdminBookingEdit({ ...fields, time: '14:00:00' })).toMatchObject({ time: '14:00' })
  })

  it('rejects a bad date, time or length', () => {
    expect(parseAdminBookingEdit({ ...fields, date: 'soon' })).toHaveProperty('error')
    expect(parseAdminBookingEdit({ ...fields, time: '25:00' })).toHaveProperty('error')
    expect(parseAdminBookingEdit({ ...fields, durationMinutes: '5' })).toHaveProperty('error')
    expect(parseAdminBookingEdit({ ...fields, durationMinutes: '90.5' })).toHaveProperty('error')
  })
})

describe('describeBookingChanges', () => {
  const before = { scheduled_date: '2026-11-18', scheduled_time: '14:00:00', estimated_duration_minutes: 120, notes: null, entry_instructions: null }
  const same = { date: '2026-11-18', time: '14:00', durationMinutes: 120, notes: null, entryInstructions: null }

  it('finds nothing when nothing changed', () => {
    expect(describeBookingChanges(before, same)).toEqual([])
  })

  it('describes each change', () => {
    expect(describeBookingChanges(before, { date: '2026-11-19', time: '09:30', durationMinutes: 90, notes: 'Hi', entryInstructions: 'Code 1234' })).toEqual([
      'moved to Thu, Nov 19 at 9:30 AM',
      'length changed to 1 hr 30 min',
      'notes updated',
      'entry instructions updated',
    ])
  })
})
