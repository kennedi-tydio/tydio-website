'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSession, getSession } from '@/lib/auth/session'
import { deleteOwnAccount } from '@/lib/accountDeletion'
import { redirect } from 'next/navigation'
import { isValidTimeZone } from '@/lib/bookingTime'
import { loadUnseenTips, type UnseenTips } from '@/lib/unseenTips'

export async function saveTimeZoneAction(timeZone: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO' || !isValidTimeZone(timeZone)) return

  await createAdminClient().from('tidypro_profiles').update({ time_zone: timeZone }).eq('id', session.profileId)
}

// Tips the Tidy Pro hasn't seen the pop-up for yet, checked when the app comes back
// to the foreground.
export async function getUnseenTipsAction(): Promise<UnseenTips> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { bookingIds: [], totalAmount: 0 }
  return loadUnseenTips(createAdminClient(), session.profileId)
}

// The Tidy Pro closed the tip pop-up. Only their own bookings are marked.
export async function markTipsSeenAction(bookingIds: string[]): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return
  if (!Array.isArray(bookingIds) || bookingIds.length === 0 || bookingIds.length > 100) return
  if (!bookingIds.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) return

  await createAdminClient()
    .from('bookings')
    .update({ tip_seen_by_pro_at: new Date().toISOString() })
    .in('id', bookingIds)
    .eq('tidy_pro_id', session.profileId)
    .is('tip_seen_by_pro_at', null)
}

export async function logoutAction() {
  await deleteSession()
  redirect('/')
}

export async function deleteAccountAction(): Promise<{ error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const result = await deleteOwnAccount(createAdminClient(), session.profileId)
  if ('error' in result) return result
  await deleteSession()
  redirect('/')
}
