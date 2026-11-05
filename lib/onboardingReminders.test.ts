/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value,
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))
vi.mock('@/lib/legal/contractorAgreement', () => ({ hasSignedCurrentAgreement: vi.fn().mockResolvedValue(true) }))

import { sendEmail } from '@/lib/email'
import { onboardingReminderDue, remainingSteps, sendOnboardingReminders } from './onboardingReminders'

const email = vi.mocked(sendEmail)
const now = new Date('2026-11-05T15:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

const finished = {
  terms_accepted: true,
  cleaner_status: 'approved',
  email_notifications_enabled: true,
  profile_photo_url: 'x.jpg',
  bio: 'Hi',
  availability: { mon: [['09:00', '17:00']] },
  stripe_onboarding_completed: true,
  travel_radius_miles: 10,
  latitude: 1,
  longitude: 1,
}

function cleaner(overrides: any = {}) {
  return { id: 'p1', created_at: daysAgo(3.5), onboarding_reminder_sent_at: null, onboarding_final_reminder_sent_at: null, ...finished, bio: null, ...overrides }
}

const goodProfile = { id: 'p1', email: 'pro@example.com', first_name: 'Nia', last_name: 'T', email_verified_at: daysAgo(4), booking_access_status: 'booking_allowed', suspended_at: null, banned_at: null }

function fakeAdmin(rows: any[], profile: any = goodProfile, check: any = null) {
  const updates: any[] = []
  const admin = {
    from: (table: string) => {
      let isUpdate = false
      const chain: any = {
        select: () => chain,
        update: (values: any) => {
          isUpdate = true
          updates.push(values)
          return chain
        },
        eq: () => chain,
        is: () => chain,
        lte: () => chain,
        gt: () => chain,
        in: () => chain,
        then: (resolve: any) => {
          if (isUpdate) return resolve({ data: [{ id: 'p1' }], error: null })
          if (table === 'profiles') return resolve({ data: profile ? [profile] : [] })
          if (table === 'background_checks') return resolve({ data: check ? [{ pro_id: 'p1', ...check }] : [] })
          return resolve({ data: rows, error: null })
        },
      }
      return chain
    },
  } as any
  return { admin, updates }
}

beforeEach(() => email.mockClear())

describe('onboardingReminderDue', () => {
  const base = { onboarding_reminder_sent_at: null, onboarding_final_reminder_sent_at: null }
  it('waits until 3 days', () => expect(onboardingReminderDue({ ...base, created_at: daysAgo(2.9) }, now)).toBeNull())
  it('sends the first at 3 days', () => expect(onboardingReminderDue({ ...base, created_at: daysAgo(3) }, now)).toBe('first'))
  it('sends the first only once', () =>
    expect(onboardingReminderDue({ ...base, onboarding_reminder_sent_at: daysAgo(1), created_at: daysAgo(4) }, now)).toBeNull())
  it('sends the final at 7 days, even if the first was missed', () => expect(onboardingReminderDue({ ...base, created_at: daysAgo(7) }, now)).toBe('final'))
  it('sends the final only once', () =>
    expect(onboardingReminderDue({ ...base, onboarding_final_reminder_sent_at: daysAgo(1), created_at: daysAgo(8) }, now)).toBeNull())
  it('leaves old accounts alone', () => expect(onboardingReminderDue({ ...base, created_at: daysAgo(30) }, now)).toBeNull())
})

describe('remainingSteps', () => {
  it('is empty once everything is done', () => expect(remainingSteps(cleaner({ bio: 'Hi' }), null, true)).toEqual([]))
  it('lists the agreement and background check before profile steps', () => {
    const steps = remainingSteps(cleaner({ terms_accepted: false, cleaner_status: 'applied' }), null, false)
    expect(steps.map((s) => s.label)).toEqual(['Sign your contractor agreement', 'Start your background check', 'Write your bio'])
  })
  it('does not ask for anything while a background check is pending', () => {
    const steps = remainingSteps(cleaner({ cleaner_status: 'applied', bio: 'Hi' }), { status: 'pending', requested_at: 'x', link_sent_at: 'x', submitted_at: 'x', denied_at: null }, true)
    expect(steps).toEqual([])
  })
})

describe('sendOnboardingReminders', () => {
  it('emails only the cleaner at 3 days', async () => {
    const { admin, updates } = fakeAdmin([cleaner()])
    expect(await sendOnboardingReminders(admin, now)).toEqual({ first: 1, final: 0, failed: 0 })
    expect(updates[0]).toHaveProperty('onboarding_reminder_sent_at')
    expect(email).toHaveBeenCalledTimes(1)
    expect(email.mock.calls[0][0].to[0].email).toBe('pro@example.com')
  })

  it('emails the cleaner and the admin at 7 days', async () => {
    const { admin, updates } = fakeAdmin([cleaner({ created_at: daysAgo(7.2), onboarding_reminder_sent_at: daysAgo(4) })])
    expect(await sendOnboardingReminders(admin, now)).toEqual({ first: 0, final: 1, failed: 0 })
    expect(updates[0]).toHaveProperty('onboarding_final_reminder_sent_at')
    expect(email.mock.calls.map((c) => c[0].to[0].email)).toEqual(['pro@example.com', 'admin@example.com'])
  })

  it('still tells the admin when the cleaner has turned emails off', async () => {
    const { admin } = fakeAdmin([cleaner({ created_at: daysAgo(7.2), email_notifications_enabled: false })])
    await sendOnboardingReminders(admin, now)
    expect(email.mock.calls.map((c) => c[0].to[0].email)).toEqual(['admin@example.com'])
  })

  it('skips cleaners who have finished', async () => {
    const { admin, updates } = fakeAdmin([cleaner({ bio: 'Hi' })])
    expect(await sendOnboardingReminders(admin, now)).toEqual({ first: 0, final: 0, failed: 0 })
    expect(updates).toEqual([])
    expect(email).not.toHaveBeenCalled()
  })

  it('skips unverified, banned, and failed-check cleaners', async () => {
    for (const [profile, check] of [
      [{ ...goodProfile, email_verified_at: null }, null],
      [{ ...goodProfile, banned_at: daysAgo(1) }, null],
      [goodProfile, { status: 'failed', requested_at: 'x', link_sent_at: 'x', submitted_at: 'x', denied_at: null }],
    ] as const) {
      const { admin } = fakeAdmin([cleaner({ cleaner_status: 'applied' })], profile, check)
      expect(await sendOnboardingReminders(admin, now)).toEqual({ first: 0, final: 0, failed: 0 })
    }
    expect(email).not.toHaveBeenCalled()
  })
})
