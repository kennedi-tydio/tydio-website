import { describe, expect, it } from 'vitest'
import { isRecurrenceFrequency, isVisitDue, nextVisitDate, recurrenceLabel, recurrenceScheduleLabel, recurringPaymentDueAt, shouldSuspendUnpaidVisit, unpaidVisitAction } from './recurrence'

describe('nextVisitDate', () => {
  it('keeps the same weekday', () => {
    expect(nextVisitDate('2026-11-20', 'weekly')).toBe('2026-11-27')
    expect(nextVisitDate('2026-11-20', 'biweekly')).toBe('2026-12-04')
    expect(nextVisitDate('2026-11-20', 'every_4_weeks')).toBe('2026-12-18')
  })

  it('crosses month and year ends', () => {
    expect(nextVisitDate('2026-12-29', 'weekly')).toBe('2027-01-05')
    expect(nextVisitDate('2028-02-26', 'weekly')).toBe('2028-03-04')
  })
})

describe('isVisitDue', () => {
  it('is due within a week', () => {
    expect(isVisitDue('2026-11-21', '2026-11-14')).toBe(true)
    expect(isVisitDue('2026-11-14', '2026-11-14')).toBe(true)
    expect(isVisitDue('2026-11-22', '2026-11-14')).toBe(false)
  })
})

describe('isRecurrenceFrequency', () => {
  it('accepts only known frequencies', () => {
    expect(isRecurrenceFrequency('weekly')).toBe(true)
    expect(isRecurrenceFrequency('every_4_weeks')).toBe(true)
    expect(isRecurrenceFrequency('daily')).toBe(false)
    expect(isRecurrenceFrequency(null)).toBe(false)
  })
})

describe('recurrenceLabel', () => {
  it('reads naturally', () => {
    expect(recurrenceLabel('biweekly')).toBe('Every 2 weeks')
  })
})

describe('recurrenceScheduleLabel', () => {
  it('names the weekday and time of the first visit', () => {
    // 2026-11-15 is a Sunday.
    expect(recurrenceScheduleLabel('weekly', '2026-11-15', '09:00')).toBe('Every Sunday at 9:00 AM')
    expect(recurrenceScheduleLabel('biweekly', '2026-11-15', '13:30')).toBe('Every other Sunday at 1:30 PM')
    expect(recurrenceScheduleLabel('every_4_weeks', '2026-11-15', '00:15')).toBe('Every 4 weeks on Sunday at 12:15 AM')
  })

  it('falls back to the plain label without a date or time', () => {
    expect(recurrenceScheduleLabel('weekly', null, '09:00')).toBe('Every week')
  })
})

describe('unpaidVisitAction', () => {
  const start = new Date('2026-12-10T14:00:00Z')
  const due = recurringPaymentDueAt(start)
  const at = (iso: string) => new Date(iso)
  const visit = (attemptedAt: string | null, suspended = false) => ({
    start,
    paymentDueAt: due,
    attemptedAt: attemptedAt ? at(attemptedAt) : null,
    suspended,
  })

  it('charges 3 days before the start', () => {
    expect(due.toISOString()).toBe('2026-12-07T14:00:00.000Z')
    expect(unpaidVisitAction(visit(null), at('2026-12-07T13:59:00Z'))).toBe('wait')
    expect(unpaidVisitAction(visit(null), at('2026-12-07T14:00:00Z'))).toBe('charge')
  })

  it('retries a day after a failed try', () => {
    expect(unpaidVisitAction(visit('2026-12-07T14:00:00Z'), at('2026-12-08T13:59:00Z'))).toBe('wait')
    expect(unpaidVisitAction(visit('2026-12-07T14:00:00Z'), at('2026-12-08T14:00:00Z'))).toBe('charge')
  })

  it('tries once more at the cutoff, even within a day of the last try', () => {
    expect(unpaidVisitAction(visit('2026-12-08T20:00:00Z'), at('2026-12-09T14:00:00Z'))).toBe('charge')
    expect(unpaidVisitAction(visit('2026-12-09T14:00:00Z'), at('2026-12-09T15:00:00Z'))).toBe('wait')
  })

  it('waits on a suspended visit, then cancels it at the start', () => {
    expect(unpaidVisitAction(visit('2026-12-09T14:00:00Z', true), at('2026-12-10T13:59:00Z'))).toBe('wait')
    expect(unpaidVisitAction(visit('2026-12-09T14:00:00Z', true), at('2026-12-10T14:00:00Z'))).toBe('cancel')
  })

  it('suspends from 24 hours before the start', () => {
    expect(shouldSuspendUnpaidVisit(start, at('2026-12-09T13:59:00Z'))).toBe(false)
    expect(shouldSuspendUnpaidVisit(start, at('2026-12-09T14:00:00Z'))).toBe(true)
  })
})
