import { describe, expect, it } from 'vitest'
import { onboardingStatusLabel, remainingOnboardingActions, type TidyProProgress } from './onboardingProgress'

const completeProfile = {
  profile_photo_url: 'x.jpg',
  bio: 'Hi',
  availability: { mon: [{ start: '09:00', end: '17:00' }] },
  stripe_onboarding_completed: true,
  travel_radius_miles: 10,
  latitude: 1,
  longitude: 1,
}

const emptyProfile = {
  profile_photo_url: null,
  bio: null,
  availability: {},
  stripe_onboarding_completed: false,
  travel_radius_miles: null,
  latitude: null,
  longitude: null,
}

const paidCheck: NonNullable<TidyProProgress['backgroundCheck']> = {
  status: 'pending',
  requested_at: '2026-11-01',
  link_sent_at: null,
  submitted_at: null,
  fee_paid_at: '2026-11-01',
  fee_refunded_at: null,
}

function pro(overrides: Partial<TidyProProgress> = {}): TidyProProgress {
  return {
    bookingAccessStatus: 'booking_allowed',
    cleanerStatus: 'applied',
    hasSignedAgreement: true,
    backgroundCheck: null,
    profile: completeProfile,
    ...overrides,
  }
}

describe('onboardingStatusLabel', () => {
  it('is waitlisted until the admin takes them off the waitlist', () => {
    expect(onboardingStatusLabel(pro({ bookingAccessStatus: 'waitlisted', backgroundCheck: paidCheck }))).toBe('waitlisted')
    expect(onboardingStatusLabel(pro({ bookingAccessStatus: 'denied' }))).toBe('denied')
  })

  it('is onboarding once off the waitlist', () => {
    expect(onboardingStatusLabel(pro())).toBe('onboarding')
  })

  it('notes when the background check is paid for', () => {
    expect(onboardingStatusLabel(pro({ backgroundCheck: paidCheck }))).toBe('onboarding · background check paid')
  })

  it('does not count a refunded fee as paid', () => {
    expect(onboardingStatusLabel(pro({ backgroundCheck: { ...paidCheck, fee_refunded_at: '2026-11-02' } }))).toBe('onboarding')
  })
})

describe('remainingOnboardingActions', () => {
  it('only lists the waitlist for a waitlisted Tidy Pro', () => {
    expect(remainingOnboardingActions(pro({ bookingAccessStatus: 'waitlisted', profile: emptyProfile }))).toEqual(['Take off the waitlist (Tydio)'])
  })

  it('lists every step, in order, for someone just off the waitlist', () => {
    expect(remainingOnboardingActions(pro({ hasSignedAgreement: false, profile: emptyProfile }))).toEqual([
      'Sign the contractor agreement',
      'Pay for the background check',
      'Set up payout method',
      'Choose availability',
      'Add a profile picture',
      'Write bio',
      'Add address',
      'Set travel distance',
    ])
  })

  it('follows the background check through each stage', () => {
    const at = (check: Partial<typeof paidCheck>) => remainingOnboardingActions(pro({ backgroundCheck: { ...paidCheck, ...check } }))
    expect(at({})).toEqual(['Send the background check form (Tydio)'])
    expect(at({ link_sent_at: '2026-11-02' })).toEqual(['Fill out the background check form'])
    expect(at({ link_sent_at: '2026-11-02', submitted_at: '2026-11-03' })).toEqual(['Record the background check result (Tydio)'])
    expect(at({ status: 'failed' })).toEqual(['Background check not passed'])
    expect(at({ fee_refunded_at: '2026-11-02' })).toEqual(['Pay for the background check'])
  })

  it('has nothing left for an approved Tidy Pro with a complete profile', () => {
    expect(remainingOnboardingActions(pro({ cleanerStatus: 'approved', backgroundCheck: { ...paidCheck, status: 'passed' } }))).toEqual([])
  })

  it('still lists profile steps after approval', () => {
    expect(remainingOnboardingActions(pro({ cleanerStatus: 'approved', profile: { ...completeProfile, bio: ' ' } }))).toEqual(['Write bio'])
  })
})
