import crypto from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { hashPassword } from '@/lib/auth/password'
import { getOrCreateConnectedAccountId, createPayoutOnboardingLink } from '@/lib/stripe/connect'
import { admin, assertTestMode, readState, writeState, TEST_LAT, TEST_LNG } from './shared'

// Gets the test accounts ready to click through the booking flow in the browser
// (Standard / Deep Cleaning included), on top of setup.e2e.ts:
//
// - one password for all three accounts, saved in .state.json (uiPassword)
// - the customer: a saved "Stripe Test Home" at the test location with a home
//   size, and the pets question answered
// - both Tidy Pros: bookable (bio, photo, booking on), each with their own
//   Standard / Deep Cleaning prices, a Stripe test Connect account and an
//   onboarding link (saved in .state.json) to finish with Stripe's test data
//
// They stay in rural south Georgia with a 1-mile radius, so no real customer
// is ever matched to them. cleanup.e2e.ts turns booking back off.
//
//   npx vitest run --config scripts/stripe-test-mode/vitest.config.ts scripts/stripe-test-mode/ui-setup.e2e.ts

const RATES = {
  // Cheaper, every add-on offered at Tydio's suggested prices.
  pro: {
    standard_base_take_home: 160,
    deep_base_take_home: 280,
    standard_room_percents: {},
    deep_room_percents: {},
    add_ons: {},
  },
  // Dearer, a bathroom at 25%, and no inside-the-oven add-on, so booking it
  // leaves this Tidy Pro out of search.
  pro2: {
    standard_base_take_home: 200,
    deep_base_take_home: 340,
    standard_room_percents: { full_bath: 25 },
    deep_room_percents: { full_bath: 25 },
    add_ons: { inside_oven: { enabled: false, take_home: null } },
  },
}

describe('ui-setup', () => {
  it('makes the test accounts ready for browser testing', async () => {
    assertTestMode()
    const s = readState()
    const db = admin()

    // A password nobody can guess, reused if one was already made.
    const uiPassword = (s as { uiPassword?: string }).uiPassword ?? `Tydio-test-${crypto.randomBytes(9).toString('base64url')}`
    const passwordHash = await hashPassword(uiPassword)
    for (const id of [s.customerId, s.proId, s.pro2Id]) {
      const { error } = await db.from('profiles').update({ password_hash: passwordHash } as never).eq('id', id)
      if (error) throw error
    }

    // Customer: pets answered, one saved address with a home size.
    {
      const { error } = await db.from('profiles').update({ has_no_pets: true } as never).eq('id', s.customerId)
      if (error) throw error
      const { data: existing } = await db.from('user_addresses').select('id').eq('user_id', s.customerId).eq('label', 'Stripe Test Home').maybeSingle()
      const address = {
        user_id: s.customerId,
        label: 'Stripe Test Home',
        street_address: '1 Test Rd',
        city: 'Thomasville',
        state: 'GA',
        zip_code: '31792',
        latitude: TEST_LAT,
        longitude: TEST_LNG,
        is_default: true,
        square_footage: '1000_1999',
      }
      const { error: addrError } = existing
        ? await db.from('user_addresses').update(address).eq('id', existing.id)
        : await db.from('user_addresses').insert(address)
      if (addrError) throw addrError
    }

    // Tidy Pros: findable by the test customer, with their own prices.
    const links: Record<string, string> = {}
    for (const [key, id] of [['pro', s.proId], ['pro2', s.pro2Id]] as const) {
      const { error } = await db
        .from('tidypro_profiles')
        .update({
          active_for_booking: true,
          bio: 'Test Tidy Pro for Stripe test mode. Not a real person.',
          profile_photo_url: '/email-logo.png',
        } as never)
        .eq('id', id)
      if (error) throw error

      const { error: ratesError } = await db
        .from('tidypro_full_service_rates')
        .upsert({ tidy_pro_id: id, ...RATES[key], updated_at: new Date().toISOString() } as never, { onConflict: 'tidy_pro_id' })
      if (ratesError) throw ratesError

      const accountId = await getOrCreateConnectedAccountId(id)
      expect(accountId).toMatch(/^acct_/)
      links[key] = await createPayoutOnboardingLink(accountId, 'http://localhost:3000/pro/profile/payouts', 'http://localhost:3000/pro/profile/payouts')
    }

    writeState({ ...s, uiPassword, onboardingUrl: links.pro, onboardingUrl2: links.pro2 } as never)
    console.log(JSON.stringify({ ready: true, accounts: 3, onboardingLinks: Object.keys(links) }))
  })
})
