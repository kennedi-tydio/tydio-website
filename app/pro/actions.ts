'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSession, getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export async function logoutAction() {
  await deleteSession()
  redirect('/')
}

export async function deleteAccountAction(): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  await admin.from('profiles').delete().eq('id', session.profileId)
  await deleteSession()
  redirect('/')
}
