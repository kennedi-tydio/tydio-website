import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import PaymentMethodsView from './PaymentMethodsView'

export const metadata: Metadata = { title: 'Payment Methods — Tydio' }

export default async function PaymentMethodsPage({
  searchParams,
}: {
  // `declined`: a card that just failed to charge for this booking draft.
  searchParams: Promise<{ draftId?: string; declined?: string }>
}) {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  const { draftId, declined } = await searchParams

  const admin = createAdminClient()

  const { data: paymentMethods, error } = await admin
    .from('payment_methods')
    .select('id, brand:card_brand, last4:card_last4, exp_month:card_exp_month, exp_year:card_exp_year, is_default')
    .eq('user_id', session.profileId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to load payment methods: ${error.message}`)

  let selectedId: string | null = null
  if (draftId) {
    const { data: draft } = await admin
      .from('booking_drafts')
      .select('selected_payment_method_id')
      .eq('id', draftId)
      .eq('customer_user_id', session.profileId)
      .maybeSingle()
    selectedId = draft?.selected_payment_method_id ?? null
  }

  const declinedId = draftId && paymentMethods?.some((pm) => pm.id === declined) ? declined! : null
  // Make them pick again rather than leaving the card that failed selected.
  if (declinedId && selectedId === declinedId) selectedId = null

  return (
    <PaymentMethodsView
      initialPaymentMethods={paymentMethods ?? []}
      draftId={draftId ?? null}
      initialSelectedId={selectedId}
      declinedId={declinedId}
    />
  )
}
