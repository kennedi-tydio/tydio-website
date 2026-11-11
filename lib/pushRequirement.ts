import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

// TEMPORARY: until Twilio approves our toll-free number we can't send texts, so push is
// the only quick way to reach people. While this is on, customers can't book and Tidy
// Pros don't show in search (an onboarding step) until push is on for at least one
// device. To remove the requirement, set this to false.
export const PUSH_REQUIRED = true

// Push goes by subscription rows (see lib/push.ts), so "has push" means at least one
// device subscribed, not just the consent flag.
export async function pushSubscribedIds(admin: Admin, profileIds: string[]): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set()
  const { data, error } = await admin.from('push_subscriptions').select('profile_id').in('profile_id', profileIds)
  if (error) throw new Error(`Failed to load push subscriptions: ${error.message}`)
  return new Set((data ?? []).map((r) => r.profile_id))
}

export async function hasPushSubscription(admin: Admin, profileId: string): Promise<boolean> {
  return (await pushSubscribedIds(admin, [profileId])).has(profileId)
}

// Adds has_push to each row, for missingOnboardingSteps / isAvailableForBooking.
export async function withPushStatus<T extends { id: string }>(admin: Admin, rows: T[]): Promise<(T & { has_push: boolean })[]> {
  const ids = await pushSubscribedIds(admin, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, has_push: ids.has(r.id) }))
}

// Whether a customer is blocked from booking right now.
export async function customerNeedsPush(admin: Admin, profileId: string): Promise<boolean> {
  return PUSH_REQUIRED && !(await hasPushSubscription(admin, profileId))
}

export const CUSTOMER_PUSH_SETUP_PATH = '/dashboard/profile/notifications?required=1'
