import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

// What someone has to turn on before they can book (customers) or show up in search and
// receive bookings (Tidy Pros, as an onboarding step):
//   'push'         push on for at least one device. For now: Twilio hasn't approved our
//                  toll-free number yet, so we can't send texts.
//   'push_or_sms'  push, or texts opted in with a phone number. Switch to this once the
//                  Twilio number is approved.
//   'none'         nothing required.
export type NotificationRequirement = 'push' | 'push_or_sms' | 'none'
export const NOTIFICATION_REQUIREMENT = 'none' as NotificationRequirement

export const NOTIFICATIONS_REQUIRED = NOTIFICATION_REQUIREMENT !== 'none'
// Push specifically, with no alternative: the notification screens say so.
export const PUSH_REQUIRED = NOTIFICATION_REQUIREMENT === 'push'

export const NOTIFICATION_STEP_LABEL = PUSH_REQUIRED ? 'Turn on push notifications' : 'Turn on push notifications or texts'

export function meetsNotificationRequirement(status: { has_push: boolean; has_sms?: boolean }): boolean {
  if (NOTIFICATION_REQUIREMENT === 'none') return true
  if (status.has_push) return true
  return NOTIFICATION_REQUIREMENT === 'push_or_sms' && !!status.has_sms
}

// Push goes by subscription rows (see lib/push.ts), so "has push" means at least one
// device subscribed, not just the consent flag.
export async function pushSubscribedIds(admin: Admin, profileIds: string[]): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set()
  const { data, error } = await admin.from('push_subscriptions').select('profile_id').in('profile_id', profileIds)
  if (error) throw new Error(`Failed to load push subscriptions: ${error.message}`)
  return new Set((data ?? []).map((r) => r.profile_id))
}

// Who can be texted, by the same rule as canSendSms in lib/sms (kept separate so this file
// stays importable from client components). Tidy Pros are texted from their Tidy Pro
// profile's phone and consent, customers from their account's.
export async function smsReadyIds(admin: Admin, profileIds: string[]): Promise<Set<string>> {
  if (profileIds.length === 0) return new Set()
  const [{ data: people, error }, { data: pros, error: prosError }] = await Promise.all([
    admin.from('profiles').select('id, role, phone, sms_phone, sms_consent').in('id', profileIds),
    admin.from('tidypro_profiles').select('id, phone, sms_consent').in('id', profileIds),
  ])
  if (error || prosError) throw new Error(`Failed to load text message status: ${(error ?? prosError)!.message}`)
  const proById = new Map((pros ?? []).map((p) => [p.id, p]))
  const ready = new Set<string>()
  for (const person of people ?? []) {
    // Customers may have a separate texting number (profiles.sms_phone).
    const source = person.role === 'TIDYPRO' ? proById.get(person.id) : person
    const phone = source && 'sms_phone' in source ? source.sms_phone || source.phone : source?.phone
    if (source?.sms_consent === 'opted_in' && phone) ready.add(person.id)
  }
  return ready
}

export async function hasPushSubscription(admin: Admin, profileId: string): Promise<boolean> {
  return (await pushSubscribedIds(admin, [profileId])).has(profileId)
}

// Adds has_push (and has_sms, when texts count) to each row, for missingOnboardingSteps /
// isAvailableForBooking.
export async function withPushStatus<T extends { id: string }>(admin: Admin, rows: T[]): Promise<(T & { has_push: boolean; has_sms: boolean })[]> {
  const ids = rows.map((r) => r.id)
  const [push, sms] = await Promise.all([
    pushSubscribedIds(admin, ids),
    NOTIFICATION_REQUIREMENT === 'push_or_sms' ? smsReadyIds(admin, ids) : Promise.resolve(new Set<string>()),
  ])
  return rows.map((r) => ({ ...r, has_push: push.has(r.id), has_sms: sms.has(r.id) }))
}

// One person's status, for the onboarding checks that look at a single Tidy Pro.
export async function notificationStatus(admin: Admin, profileId: string): Promise<{ has_push: boolean; has_sms: boolean }> {
  const [row] = await withPushStatus(admin, [{ id: profileId }])
  return { has_push: row.has_push, has_sms: row.has_sms }
}

// Whether a customer is blocked from booking right now.
export async function customerNeedsPush(admin: Admin, profileId: string): Promise<boolean> {
  if (!NOTIFICATIONS_REQUIRED) return false
  return !meetsNotificationRequirement(await notificationStatus(admin, profileId))
}

export const CUSTOMER_PUSH_SETUP_PATH = '/dashboard/profile/notifications?required=1'
