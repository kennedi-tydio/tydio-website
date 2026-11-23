'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { bookingBlockedByAccess, bookingBlockedBySuspension } from '@/lib/accountSuspension'
import { customerNeedsPush } from '@/lib/pushRequirement'
import { customerNeedsPets } from '@/lib/customerPetsData'
import { PETS_REQUIRED_MESSAGE } from '@/lib/customerPets'
import { approveAndPayQuote, declineQuoteAsCustomer } from '@/lib/quoteRequests'

// "Approve & Pay": the card is charged and only then is the booking request sent to the
// Tidy Pro, who accepts or declines it as usual. The same customer checks as confirming
// a booking on the review page.
export async function approveQuoteAction(
  quoteId: string
): Promise<{ bookingId: string } | { error: string; paymentFailed?: true; promoFailed?: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const admin = createAdminClient()
  const suspended = await bookingBlockedBySuspension(admin, session.profileId)
  if (suspended) return { error: suspended }
  const noAccess = await bookingBlockedByAccess(admin, session.profileId)
  if (noAccess) return { error: noAccess }
  if (await customerNeedsPush(admin, session.profileId)) {
    return { error: 'Turn on push notifications in Profile → Notifications before booking, so we can reach you about it.' }
  }
  if (await customerNeedsPets(admin, session.profileId)) return { error: PETS_REQUIRED_MESSAGE }

  const result = await approveAndPayQuote(admin, { quoteId, customerId: session.profileId })
  revalidatePath(`/dashboard/quotes/${quoteId}`)
  if ('bookingId' in result) {
    revalidatePath('/dashboard')
    revalidatePath('/dashboard/messages')
    revalidatePath('/dashboard/bookings')
  }
  return result
}

// Declining the quote, or withdrawing the request before it's quoted. The tasks go back
// on the dashboard.
export async function declineQuoteAction(quoteId: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Not authorized' }

  const result = await declineQuoteAsCustomer(createAdminClient(), { quoteId, customerId: session.profileId })
  revalidatePath(`/dashboard/quotes/${quoteId}`)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/messages')
  return result
}

// A promo code that can't be used any more, removed so the quote can be paid at full price.
export async function removeQuotePromoAction(quoteId: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  await createAdminClient()
    .from('booking_quote_requests')
    .update({ gift_code: null, updated_at: new Date().toISOString() })
    .eq('id', quoteId)
    .eq('user_id', session.profileId)
    .in('status', ['requested', 'quoted'])
  revalidatePath(`/dashboard/quotes/${quoteId}`)
}
