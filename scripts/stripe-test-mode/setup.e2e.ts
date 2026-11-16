import { describe, it, expect } from 'vitest'
import { getOrCreateConnectedAccountId, createPayoutOnboardingLink } from '@/lib/stripe/connect'
import { admin, assertTestMode, TEST_EMAILS, TEST_LAT, TEST_LNG, writeState, type TestState } from './shared'


const SERVICES = ['taskBased', 'standardCleaning', 'deepCleaning', 'laundry', 'laundromat', 'petEnclosures', 'litterBoxes']
const ALL_DAY = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [{ start: '00:00', end: '23:59' }]]))

async function findOrCreateProfile(email: string, role: 'USER' | 'TIDYPRO', firstName: string, lastName: string, phone: string): Promise<string> {
  const db = admin()
  const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) return existing.id
  const now = new Date().toISOString()
  const { data, error } = await db
    .from('profiles')
    .insert({
      email,
      role,
      // Reserved fictional 555-01xx numbers: unique per role, never a real phone.
      phone,
      first_name: firstName,
      last_name: lastName,
      city: 'Atlanta',
      state: 'GA',
      zip_code: '30305',
      email_verified_at: now,
      terms_accepted_at: now,
      privacy_policy_accepted_at: now,
      booking_access_status: 'booking_allowed',
      booking_access_granted_at: now,
      sms_notifications_enabled: false,
      email_notifications_enabled: true,
    } as never)
    .select('id')
    .single()
  if (error) throw error
  return data!.id
}

async function upsertTidyPro(id: string) {
  const { error } = await admin()
    .from('tidypro_profiles')
    .upsert({
      id,
      cleaner_status: 'approved',
      active_for_booking: false,
      is_away: false,
      services_provided: SERVICES,
      state: 'GA',
      city: 'Thomasville',
      zip_code: '31792',
      latitude: TEST_LAT,
      longitude: TEST_LNG,
      travel_radius_miles: 1,
      time_zone: 'America/New_York',
      availability: ALL_DAY,
      phone: null,
      sms_consent: null,
      booking_alerts_enabled: false,
      sms_notifications_enabled: false,
      terms_accepted: true,
    } as never)
  if (error) throw error
}

describe('setup', () => {
  it('creates test accounts and the payout onboarding link', async () => {
    assertTestMode()
    const customerId = await findOrCreateProfile(TEST_EMAILS.customer, 'USER', 'Stripe', 'Test Customer', '2025550101')
    const proId = await findOrCreateProfile(TEST_EMAILS.pro, 'TIDYPRO', 'Stripe Test', 'Pro', '2025550102')
    const pro2Id = await findOrCreateProfile(TEST_EMAILS.pro2, 'TIDYPRO', 'Stripe Test', 'Pro Two', '2025550103')
    await upsertTidyPro(proId)
    await upsertTidyPro(pro2Id)

    const proAccountId = await getOrCreateConnectedAccountId(proId)
    expect(proAccountId).toMatch(/^acct_/)
    const state: TestState = { customerId, proId, pro2Id, proAccountId }
    writeState(state)

    const url = await createPayoutOnboardingLink(proAccountId, 'http://localhost:3000/pro/profile/payouts', 'http://localhost:3000/pro/profile/payouts')
    writeState({ ...state, onboardingUrl: url } as TestState)
  })
})
