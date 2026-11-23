'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { declineQuoteAsTidyPro, previewQuote, submitQuote } from '@/lib/quoteRequests'

// The price the customer would pay and the Tidy Pro's pay, for the prices entered so far.
export async function previewQuoteAction(
  quoteId: string,
  pricesByTaskId: Record<string, number>
): Promise<{ servicePrice: number; cleanerPay: number } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  return previewQuote(createAdminClient(), { quoteId, tidyProId: session.profileId, pricesByTaskId })
}

export async function sendQuoteAction(
  quoteId: string,
  pricesByTaskId: Record<string, number>,
  note: string
): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  const result = await submitQuote(createAdminClient(), { quoteId, tidyProId: session.profileId, pricesByTaskId, note })
  revalidatePath(`/pro/quotes/${quoteId}`)
  revalidatePath('/pro/messages')
  return result
}

export async function declineQuoteRequestAction(quoteId: string, reason: string): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }
  const result = await declineQuoteAsTidyPro(createAdminClient(), { quoteId, tidyProId: session.profileId, reason })
  revalidatePath(`/pro/quotes/${quoteId}`)
  revalidatePath('/pro/messages')
  return result
}
