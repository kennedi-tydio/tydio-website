import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

// The card the customer marked as their default, preselected when they book or pay.
export async function defaultPaymentMethodId(admin: Admin, customerId: string): Promise<string | null> {
  const { data } = await admin
    .from('payment_methods')
    .select('id')
    .eq('user_id', customerId)
    .eq('is_default', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// The first card a customer books with becomes their default, unless they've already
// picked one. Best effort: a booking never fails over it.
export async function makeDefaultIfNone(admin: Admin, customerId: string, paymentMethodId: string): Promise<void> {
  try {
    if (await defaultPaymentMethodId(admin, customerId)) return
    await admin.from('payment_methods').update({ is_default: true }).eq('id', paymentMethodId).eq('user_id', customerId)
  } catch (err) {
    console.error('Setting the default payment method failed', err)
  }
}
