'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

export interface SavedPaymentMethod {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  is_default: boolean
}

export interface NewCardInput {
  cardNumber: string
  expMonth: number
  expYear: number
}

function detectBrand(digits: string): string {
  if (digits.startsWith('4')) return 'Visa'
  if (/^5[1-5]/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (digits.startsWith('6')) return 'Discover'
  return 'Card'
}

export async function createPaymentMethodAction(
  input: NewCardInput
): Promise<SavedPaymentMethod | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const digits = input.cardNumber.replace(/\D/g, '')
  if (digits.length < 12) return { error: 'Enter a valid card number.' }
  if (input.expMonth < 1 || input.expMonth > 12) return { error: 'Enter a valid expiration month.' }
  if (input.expYear < new Date().getFullYear()) return { error: 'Enter a valid expiration year.' }

  const admin = createAdminClient()

  const { count } = await admin
    .from('payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.profileId)

  const { data, error } = await admin
    .from('payment_methods')
    .insert({
      user_id: session.profileId,
      brand: detectBrand(digits),
      last4: digits.slice(-4),
      exp_month: input.expMonth,
      exp_year: input.expYear,
      is_default: (count ?? 0) === 0,
    })
    .select('id, brand, last4, exp_month, exp_year, is_default')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to save payment method.' }

  revalidatePath('/dashboard/profile/payment-methods')
  return data
}

export async function selectPaymentMethodForDraftAction(
  draftId: string,
  paymentMethodId: string
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('booking_drafts')
    .update({ selected_payment_method_id: paymentMethodId })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  if (error) return { error: error.message }

  revalidatePath('/book/review')
  return { success: true }
}
