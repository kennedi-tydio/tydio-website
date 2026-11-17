'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { grossUpForStripeFee } from '@/lib/pricingRules'
import { chargeableCards, type ChargeableCard } from '@/lib/stripe/chargeableCards'
import { quoteTaskAddition, requestTaskAddition } from '@/lib/bookingTaskAdditions'

export type TaskAdditionQuoteView = {
  amountCents: number
  addedMinutes: number
  offerSeries: boolean
  cards: ChargeableCard[]
  defaultCardId: string | null
}

function validIds(taskIds: unknown): taskIds is string[] {
  return Array.isArray(taskIds) && taskIds.length > 0 && taskIds.length <= 50 && taskIds.every((id) => typeof id === 'string' && id.length <= 100)
}

// What adding these dashboard tasks costs, and what each saved card would be charged.
export async function quoteTaskAdditionAction(bookingId: string, taskIds: string[]): Promise<TaskAdditionQuoteView | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Please sign in again.' }
  if (!validIds(taskIds)) return { error: 'Choose at least one task to add.' }

  const admin = createAdminClient()
  const result = await quoteTaskAddition(admin, { customerId: session.profileId, bookingId, taskIds })
  if ('error' in result) return result

  const { amount, addedMinutes } = result.quote
  const { cards, defaultCardId } = await chargeableCards(admin, session.profileId, (percentage) => grossUpForStripeFee(amount, percentage))
  return { amountCents: Math.round(amount * 100), addedMinutes, offerSeries: result.offerSeries, cards, defaultCardId }
}

// Charges for the added tasks and sends them to the Tidy Pro as an additional task
// request. paymentFailed means the card itself was declined, so another can be picked.
export async function requestTaskAdditionAction(
  bookingId: string,
  taskIds: string[],
  applyToSeries: boolean,
  paymentMethodId: string,
  expectedCents: number,
  attemptId: string
): Promise<{ success: true } | { error: string; paymentFailed?: true }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Please sign in again.' }
  if (!validIds(taskIds)) return { error: 'Choose at least one task to add.' }
  if (!Number.isInteger(expectedCents) || expectedCents <= 0 || !/^[\w-]{8,64}$/.test(attemptId)) return { error: 'Please refresh the page and try again.' }

  const result = await requestTaskAddition(createAdminClient(), {
    customerId: session.profileId,
    bookingId,
    taskIds,
    applyToSeries: applyToSeries === true,
    paymentMethodId,
    expectedCents,
    attemptId,
  })
  if ('error' in result) return result

  revalidatePath(`/dashboard/bookings/${bookingId}`)
  revalidatePath('/dashboard')
  revalidatePath(`/pro/messages/${bookingId}`)
  revalidatePath('/pro/messages')
  return { success: true }
}
