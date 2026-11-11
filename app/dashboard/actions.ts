'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSession, getSession } from '@/lib/auth/session'
import { deleteOwnAccount } from '@/lib/accountDeletion'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { TidyTask } from './types'
import { extensionForType } from '@/lib/uploadExtension'
import { CUSTOMER_TASK_PHOTOS_BUCKET, isOwnTaskPhotoPath } from '@/lib/petTasks'

const DEFAULT_ROOMS = ['Entire home', 'Kitchen', 'Bedroom', 'Bathroom']

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

// Not exported: a 'use server' file may only export async functions.
const MAX_ROOM_NAME_LENGTH = 40

// Saves a room the customer typed in Add Task to their profile as soon as they
// submit it, so it stays an option even if they back out of adding the task.
export async function saveCustomRoom(name: string): Promise<{ error: string } | { room: string }> {
  const session = await getSession()
  if (!session) return { error: 'Please sign in again.' }

  const room = name.trim().replace(/\s+/g, ' ')
  if (!room) return { error: 'Enter a name.' }
  if (room.length > MAX_ROOM_NAME_LENGTH) return { error: `Keep it under ${MAX_ROOM_NAME_LENGTH} characters.` }
  if (DEFAULT_ROOMS.some(r => r.toLowerCase() === room.toLowerCase())) return { room }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('custom_rooms')
    .eq('id', session.profileId)
    .single()
  const existing = (profile?.custom_rooms as string[] | null) ?? []
  const match = existing.find(r => r.toLowerCase() === room.toLowerCase())
  if (match) return { room: match }

  const { error } = await admin
    .from('profiles')
    .update({ custom_rooms: [...existing, room] })
    .eq('id', session.profileId)
  if (error) return { error: 'That couldn’t be saved. Please try again.' }
  // So the dashboard's saved rooms include it after navigating away and back.
  revalidatePath('/dashboard')
  return { room }
}

export async function saveTasks(
  tasks: TidyTask[],
  draftId: string | null
): Promise<string | null> {
  const session = await getSession()
  if (!session) return null
  const userId = session.profileId

  const admin = createAdminClient()

  // A pet task's photos are signed for the Tidy Pro later, so a task may only
  // ever point at this customer's own uploads.
  tasks = tasks.map(t =>
    t.pet ? { ...t, pet: { ...t.pet, photos: (t.pet.photos ?? []).filter(p => isOwnTaskPhotoPath(p, userId)) } } : t
  )

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

const ALLOWED_TASK_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_TASK_PHOTO_SIZE_BYTES = 10 * 1024 * 1024

// A photo the customer adds to a pet enclosure / litter box task in Add Task.
// Stored privately under their own profile folder; the AI check and booking
// pages read it through the server, never a public link.
export async function uploadTaskPhotoAction(formData: FormData): Promise<{ path: string } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Please sign in again.' }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Please choose a photo to upload.' }
  if (!ALLOWED_TASK_PHOTO_TYPES.includes(file.type)) return { error: 'Please upload a JPG, PNG, or WEBP photo.' }
  if (file.size > MAX_TASK_PHOTO_SIZE_BYTES) return { error: 'Photo is too large. Please upload something under 10MB.' }

  const path = `${session.profileId}/${crypto.randomUUID()}.${extensionForType(file.type)}`
  const admin = createAdminClient()
  const { error } = await admin.storage
    .from(CUSTOMER_TASK_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    console.error('[Tydio] Task photo upload failed:', error)
    return { error: 'That photo didn’t upload.' }
  }
  return { path }
}

// Removes a photo the customer took out of Add Task before saving the task.
// Best-effort: an orphaned photo is still removed with the account.
export async function removeTaskPhotoAction(path: string): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER' || !isOwnTaskPhotoPath(path, session.profileId)) return
  const { error } = await createAdminClient().storage.from(CUSTOMER_TASK_PHOTOS_BUCKET).remove([path])
  if (error) console.error('[Tydio] Removing task photo failed:', error)
}
