import fs from 'node:fs'
import path from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'

// The test accounts. Their mail lands in the owner's own inboxes via Gmail "+" aliases.
export const TEST_EMAILS = {
  customer: 'kennedicoats773+stripetest@gmail.com',
  pro: 'rvrblossom+stripetest@gmail.com',
  pro2: 'rvrblossom+stripetest2@gmail.com',
} as const

// Rural south Georgia, far from any real customer, with a 1-mile radius, and booking
// turned off, so real customers on the live site can never be matched to these.
export const TEST_LAT = 30.705
export const TEST_LNG = -84.015

export const LOG_FILE = path.resolve(__dirname, '.results.log')

export const STATE_FILE = path.resolve(__dirname, '.state.json')

export type TestState = { customerId: string; proId: string; pro2Id: string; proAccountId?: string; onboardingUrl?: string }

export function assertTestMode() {
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  if (!key.startsWith('sk_test_')) throw new Error('Refusing to run: STRIPE_SECRET_KEY is not a test key.')
}

export function readState(): TestState {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}

export function writeState(state: TestState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

export const admin = () => createAdminClient()
