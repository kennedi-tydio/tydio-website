import type { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/normalizePhone'

type Admin = ReturnType<typeof createAdminClient>

// A customer can get texts at a different number than the phone on their
// profile (profiles.sms_phone, migration 083). Null means "text the phone on
// file". Tidy Pros don't have one: they're texted at tidypro_profiles.phone.

type PhoneFields = { phone: string | null; sms_phone?: string | null }

// The number a customer's texts go to.
export function textingPhone(person: PhoneFields | null | undefined): string | null {
  return person?.sms_phone || person?.phone || null
}

export function isSamePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normalizePhone(a) === normalizePhone(b)
}

// Every customer and Tidy Pro row with this number, as a profile phone or a
// customer's texting number. Phones are saved as typed, so rows are found by
// their last four digits and then compared in full. `target` is normalized.
export async function rowsWithPhone(
  admin: Admin,
  target: string
): Promise<{ table: 'profiles' | 'tidypro_profiles'; id: string }[]> {
  if (target.length < 4) return []
  const suffix = `%${target.slice(-4)}`
  const [byPhone, bySmsPhone, byProPhone] = await Promise.all([
    admin.from('profiles').select('id, phone, sms_phone').ilike('phone', suffix),
    admin.from('profiles').select('id, phone, sms_phone').ilike('sms_phone', suffix),
    admin.from('tidypro_profiles').select('id, phone').ilike('phone', suffix),
  ])
  const matches = (p: string | null | undefined) => !!p && normalizePhone(p) === target
  const customerIds = new Set(
    [...(byPhone.data ?? []), ...(bySmsPhone.data ?? [])].filter((r) => matches(r.phone) || matches(r.sms_phone)).map((r) => r.id)
  )
  const proIds = (byProPhone.data ?? []).filter((r) => matches(r.phone)).map((r) => r.id)
  return [
    ...[...customerIds].map((id) => ({ table: 'profiles' as const, id })),
    ...proIds.map((id) => ({ table: 'tidypro_profiles' as const, id })),
  ]
}

// What to save when a customer opts in with `entered`. With no phone on file,
// it becomes their profile phone. Otherwise the profile phone is kept, and
// `entered` is saved as the texting number unless it's the same number.
export function customerSmsPhoneUpdate(
  profilePhone: string | null,
  entered: string
): { phone?: string; sms_phone: string | null } {
  if (!profilePhone?.trim()) return { phone: entered, sms_phone: null }
  return { sms_phone: isSamePhone(profilePhone, entered) ? null : entered }
}
