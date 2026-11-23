import type { createAdminClient } from '@/lib/supabase/admin'
import { LATE_CANCEL_REASON } from '@/lib/bookingRequestGroups'
import {
  INVALID_PROMO_MESSAGE,
  normalizePromoCode,
  promoUnavailableReason,
  summarizeUsesByCustomer,
  type PromoCode,
  type PromoUsage,
} from '@/lib/promoCodes'

type Admin = ReturnType<typeof createAdminClient>

export const PROMO_CODE_COLUMNS = 'id, code, active, discount_type, discount_value, expires_at, max_redemptions, max_uses_per_customer, recipients_only'

// A booking that used a code counts as a use unless it was canceled or declined and
// refunded; a late cancellation or a settled incident kept the customer's money, so it
// still counts. A request sent to several Tidy Pros is one booking (one payment).
export const USED_FILTER = `status.not.in.(cancelled,declined),cancelled_reason.eq.${LATE_CANCEL_REASON},incident_resolved_at.not.is.null`

type UseRow = {
  id: string
  user_id: string | null
  stripe_payment_intent_id: string | null
  promo_code_id: string
  promo_discount: number | null
  created_at: string
}

function countUses(rows: UseRow[]): number {
  return new Set(rows.map((r) => r.stripe_payment_intent_id ?? r.id)).size
}

async function usedBookings(admin: Admin, promoIds: string[]): Promise<UseRow[]> {
  if (promoIds.length === 0) return []
  const { data, error } = await admin
    .from('bookings')
    .select('id, user_id, stripe_payment_intent_id, promo_code_id, promo_discount, created_at')
    .in('promo_code_id', promoIds)
    .or(USED_FILTER)
  if (error) throw error
  return (data ?? []) as UseRow[]
}

export async function promoUsageForCustomer(admin: Admin, promo: PromoCode, customerId: string): Promise<PromoUsage> {
  const [uses, { data: recipient }] = await Promise.all([
    usedBookings(admin, [promo.id]),
    promo.recipients_only
      ? admin.from('promo_code_recipients').select('profile_id').eq('promo_code_id', promo.id).eq('profile_id', customerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return {
    customerUses: countUses(uses.filter((u) => u.user_id === customerId)),
    totalUses: countUses(uses),
    isRecipient: !!recipient,
  }
}

// The code as this customer typed it, if they can use it now.
export async function findPromoForCustomer(
  admin: Admin,
  rawCode: string,
  customerId: string,
  now: Date = new Date()
): Promise<{ promo: PromoCode } | { error: string }> {
  const code = normalizePromoCode(rawCode)
  if (!code) return { error: 'Enter a promo code.' }

  // Codes are stored uppercase, so this is an exact match. ilike would treat _ and % as wildcards.
  const { data, error } = await admin.from('promo_codes').select(PROMO_CODE_COLUMNS).eq('code', code).maybeSingle()
  if (error) return { error: 'Could not check that promo code. Please try again.' }
  const promo = (data as PromoCode | null) ?? null
  if (!promo) return { error: INVALID_PROMO_MESSAGE }

  const reason = promoUnavailableReason(promo, await promoUsageForCustomer(admin, promo, customerId), now)
  return reason ? { error: reason } : { promo }
}

export type AdminPromoCustomerUse = {
  customerId: string
  name: string
  email: string | null
  uses: number
  discount: number
  lastUsedAt: string
}

export type AdminPromoCode = PromoCode & {
  created_at: string
  uses: number
  emailed: number
  discountGiven: number
  usesByCustomer: AdminPromoCustomerUse[]
}

export async function listPromoCodesForAdmin(admin: Admin): Promise<AdminPromoCode[]> {
  const { data, error } = await admin
    .from('promo_codes')
    .select(`${PROMO_CODE_COLUMNS}, created_at`)
    .order('created_at', { ascending: false })
  if (error) throw error
  const promos = (data ?? []) as (PromoCode & { created_at: string })[]
  if (promos.length === 0) return []

  const ids = promos.map((p) => p.id)
  const [uses, { data: recipients }] = await Promise.all([
    usedBookings(admin, ids),
    admin.from('promo_code_recipients').select('promo_code_id').in('promo_code_id', ids),
  ])

  // Names for everyone who used a code.
  const customerIds = [...new Set(uses.map((u) => u.user_id).filter((id): id is string => !!id))]
  const { data: customers } = customerIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', customerIds)
    : { data: [] }
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]))

  return promos.map((p) => {
    const mine = uses.filter((u) => u.promo_code_id === p.id)
    // One discount per payment, even when the request went to several Tidy Pros.
    const perPayment = new Map(mine.map((u) => [u.stripe_payment_intent_id ?? u.id, Number(u.promo_discount ?? 0)]))
    const discountGiven = [...perPayment.values()].reduce((sum, d) => sum + d, 0)
    return {
      ...p,
      discount_value: Number(p.discount_value),
      uses: perPayment.size,
      emailed: (recipients ?? []).filter((r) => r.promo_code_id === p.id).length,
      discountGiven: Math.round(discountGiven * 100) / 100,
      usesByCustomer: summarizeUsesByCustomer(mine).map((u) => {
        const c = customerById.get(u.customerId)
        return {
          ...u,
          name: [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.email || 'Deleted account',
          email: c?.email ?? null,
        }
      }),
    }
  })
}

export type PromoRecipientCandidate = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  marketingOptIn: boolean
  createdAt: string
}

// Customers a code can be emailed to. Banned accounts are left out.
export async function listPromoRecipientCandidates(admin: Admin): Promise<PromoRecipientCandidate[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, first_name, last_name, marketing_opt_in_at, created_at')
    .eq('role', 'USER')
    .is('banned_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? [])
    .filter((p) => !!p.email)
    .map((p) => ({
      id: p.id,
      email: p.email,
      firstName: p.first_name,
      lastName: p.last_name,
      marketingOptIn: !!p.marketing_opt_in_at,
      createdAt: p.created_at,
    }))
}
