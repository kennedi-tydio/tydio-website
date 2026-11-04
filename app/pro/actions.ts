'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSession, getSession } from '@/lib/auth/session'
import { deleteOwnAccount } from '@/lib/accountDeletion'
import { redirect } from 'next/navigation'
import { isValidTimeZone } from '@/lib/bookingTime'

export async function saveTimeZoneAction(timeZone: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO' || !isValidTimeZone(timeZone)) return

  await createAdminClient().from('tidypro_profiles').update({ time_zone: timeZone }).eq('id', session.profileId)
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
