/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  emailShell: (body: string) => body,
  escapeHtml: (value: string) => value,
  TYDIO_ADMIN_EMAIL: 'admin@example.com',
}))

import { sendEmail } from '@/lib/email'
import { notifyIfOnboardingComplete } from './onboardingComplete'

const email = vi.mocked(sendEmail)

const bookable = {
  cleaner_status: 'approved',
  active_for_booking: true,
  onboarding_completed_notified_at: null,
  profile_photo_url: 'x.jpg',
  bio: 'Hi',
  availability: { mon: [{ start: '09:00', end: '17:00' }] },
  stripe_onboarding_completed: true,
  travel_radius_miles: 10,
  services_provided: ['taskBased'],
  latitude: 1,
  longitude: 1,
  city: 'Atlanta',
  state: 'GA',
}

function fakeAdmin(tidyPro: any, { claimed = true } = {}) {
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
        in: () => chain,
        maybeSingle: () =>
          Promise.resolve(
            table === 'profiles'
              ? { data: { email: 'pro@example.com', first_name: 'Nia', last_name: 'T' }, error: null }
              : { data: tidyPro, error: null }
          ),
        then: (resolve: any) =>
          table === 'push_subscriptions'
            ? resolve({ data: [{ profile_id: 'p1' }], error: null })
            : resolve({ data: isUpdate && claimed ? [{ id: 'p1' }] : [], error: null }),
      }
      return chain
    },
  }
  return { admin: admin as any, updates }
}

beforeEach(() => email.mockClear())

describe('notifyIfOnboardingComplete', () => {
  it('emails the admin once a cleaner is bookable, and records it', async () => {
    const { admin, updates } = fakeAdmin(bookable)
    expect(await notifyIfOnboardingComplete(admin, 'p1')).toBe(true)
    expect(updates).toHaveLength(1)
    expect(updates[0].onboarding_completed_notified_at).toEqual(expect.any(String))
    expect(email).toHaveBeenCalledTimes(1)
    const sent = email.mock.calls[0][0]
    expect(sent.to).toEqual([{ email: 'admin@example.com' }])
    expect(sent.subject).toBe('Nia T finished onboarding and can take bookings')
    expect(sent.htmlContent).toContain('pro@example.com')
    expect(sent.htmlContent).toContain('Atlanta, GA')
  })

  it('does nothing when already notified', async () => {
    const { admin, updates } = fakeAdmin({ ...bookable, onboarding_completed_notified_at: '2026-11-01T00:00:00Z' })
    expect(await notifyIfOnboardingComplete(admin, 'p1')).toBe(false)
    expect(updates).toHaveLength(0)
    expect(email).not.toHaveBeenCalled()
  })

  it.each([
    ['not approved yet', { cleaner_status: 'pending' }],
    ['paused', { active_for_booking: false }],
    ['missing payouts', { stripe_onboarding_completed: false }],
    ['missing a bio', { bio: '  ' }],
    ['no availability', { availability: { mon: [] } }],
    ['no address', { latitude: null }],
    ['no travel distance', { travel_radius_miles: null }],
    ['no services chosen', { services_provided: null }],
    ['no photo', { profile_photo_url: null }],
  ])('does nothing when %s', async (_label, overrides) => {
    const { admin, updates } = fakeAdmin({ ...bookable, ...overrides })
    expect(await notifyIfOnboardingComplete(admin, 'p1')).toBe(false)
    expect(updates).toHaveLength(0)
    expect(email).not.toHaveBeenCalled()
  })

  it("doesn't email when another save already claimed it", async () => {
    const { admin } = fakeAdmin(bookable, { claimed: false })
    expect(await notifyIfOnboardingComplete(admin, 'p1')).toBe(false)
    expect(email).not.toHaveBeenCalled()
  })

  it('swallows errors so the triggering save still succeeds', async () => {
    email.mockRejectedValueOnce(new Error('smtp down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { admin } = fakeAdmin(bookable)
    expect(await notifyIfOnboardingComplete(admin, 'p1')).toBe(false)
    spy.mockRestore()
  })
})
