'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSession, getSession } from '@/lib/auth/session'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { TidyTask } from './types'

const DEFAULT_ROOMS = ['Kitchen', 'Bedroom', 'Bathroom']

export async function logoutAction() {
  await deleteSession()
  redirect('/')
}

export async function deleteAccountAction(): Promise<void> {
  const session = await getSession()
  if (!session) redirect('/login')

  const admin = createAdminClient()
  await admin.from('profiles').delete().eq('id', session.profileId)
  await deleteSession()
  redirect('/')
}

export async function deleteDraft(draftId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('booking_drafts').delete().eq('id', draftId)
  revalidatePath('/dashboard')
}

export async function saveTasks(
  userId: string,
  tasks: TidyTask[],
  draftId: string | null
): Promise<string | null> {
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
