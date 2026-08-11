'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TidyTask } from '@/app/dashboard/types'

async function loadOwnedDraftTasks(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
  profileId: string
): Promise<TidyTask[]> {
  const { data } = await admin
    .from('booking_drafts')
    .select('task_list')
    .eq('id', draftId)
    .eq('customer_user_id', profileId)
    .maybeSingle()
  return (data?.task_list as TidyTask[] | null) ?? []
}

export async function updateTaskNoteAction(draftId: string, taskId: string, note: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const admin = createAdminClient()
  const tasks = await loadOwnedDraftTasks(admin, draftId, session.profileId)
  const updated = tasks.map((t) => (t.id === taskId ? { ...t, notes: note } : t))

  await admin
    .from('booking_drafts')
    .update({ task_list: updated as never })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

// "Removing" a task from the booking just unmarks it as selected — the task
// itself stays on the draft so it still shows up (unselected) back on the
// dashboard task list.
export async function removeTaskFromBookingAction(draftId: string, taskId: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const admin = createAdminClient()
  const tasks = await loadOwnedDraftTasks(admin, draftId, session.profileId)
  const updated = tasks.map((t) => (t.id === taskId ? { ...t, completed: false } : t))

  await admin
    .from('booking_drafts')
    .update({ task_list: updated as never })
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}

export interface DraftDetailsUpdate {
  pets?: string
  notes?: string
  suppliesProvided?: boolean
  giftCode?: string
}

export async function updateDraftDetailsAction(draftId: string, updates: DraftDetailsUpdate): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return

  const payload: { pets?: string; notes?: string; supplies_provided?: boolean; gift_code?: string } = {}
  if (updates.pets !== undefined) payload.pets = updates.pets
  if (updates.notes !== undefined) payload.notes = updates.notes
  if (updates.suppliesProvided !== undefined) payload.supplies_provided = updates.suppliesProvided
  if (updates.giftCode !== undefined) payload.gift_code = updates.giftCode
  if (Object.keys(payload).length === 0) return

  const admin = createAdminClient()
  await admin
    .from('booking_drafts')
    .update(payload)
    .eq('id', draftId)
    .eq('customer_user_id', session.profileId)

  revalidatePath('/book/review')
}
