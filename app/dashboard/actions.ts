'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSession, getSession } from '@/lib/auth/session'
import { deleteOwnAccount } from '@/lib/accountDeletion'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { TidyTask } from './types'

const DEFAULT_ROOMS = ['Kitchen', 'Bedroom', 'Bathroom']

export async function logoutAction() {
  await deleteSession()
  redirect('/')
}

export async function deleteAccountAction(): Promise<{ error: string }> {
  const session = await getSession()
  if (!session) redirect('/login')

  const result = await deleteOwnAccount(createAdminClient(), session.profileId)
  if ('error' in result) return result
  await deleteSession()
  redirect('/')
}

export async function deleteDraft(draftId: string): Promise<void> {
  const session = await getSession()
  if (!session) return

  const admin = createAdminClient()
  await admin.from('booking_drafts').delete().eq('id', draftId).eq('customer_user_id', session.profileId)
  revalidatePath('/dashboard')
}

export async function saveTasks(
  tasks: TidyTask[],
  draftId: string | null
): Promise<string | null> {
  const session = await getSession()
  if (!session) return null
  const userId = session.profileId

  const admin = createAdminClient()

  // Persist any custom rooms (non-default) to the user's profile
  const taskRooms = [...new Set(tasks.map(t => t.room))]
  const newCustomRooms = taskRooms.filter(r => !DEFAULT_ROOMS.includes(r))
  if (newCustomRooms.length > 0) {
    const { data: profile } = await admin
      .from('profiles')
      .select('custom_rooms')
      .eq('id', userId)
      .single()
    const existing = (profile?.custom_rooms as string[] | null) ?? []
    const toAdd = newCustomRooms.filter(r => !existing.includes(r))
    if (toAdd.length > 0) {
      await admin
        .from('profiles')
        .update({ custom_rooms: [...existing, ...toAdd] })
        .eq('id', userId)
    }
  }

  if (draftId) {
    await admin
      .from('booking_drafts')
      .update({ task_list: tasks as never })
      .eq('id', draftId)
      .eq('customer_user_id', userId)
    revalidatePath('/dashboard')
    return draftId
  }

  const { data } = await admin
    .from('booking_drafts')
    .insert({
      customer_user_id: userId,
      task_list: tasks as never,
      last_step_reached: 1,
    })
    .select('id')
    .single()

  revalidatePath('/dashboard')
  return data?.id ?? null
}
