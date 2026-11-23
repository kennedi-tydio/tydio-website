'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  FULL_SERVICE_CUSTOMER_ENABLED,
  canPrepareFullService,
  emptySelection,
  isFullServiceType,
  isWizardStep,
  normalizeFullServiceSelection,
  type FullServiceSelection,
  type WizardStep,
} from '@/lib/fullService'
import { furthestStep } from '@/lib/fullServiceDraft'

type Admin = ReturnType<typeof createAdminClient>

async function latestDraft(admin: Admin, profileId: string) {
  const { data } = await admin
    .from('booking_drafts')
    .select('id, task_list, full_service')
    .eq('customer_user_id', profileId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

// Waitlisted / paused customers can set a cleaning up too; booking it is
// checked on /book.
async function canPrepare(admin: Admin, profileId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('booking_access_status').eq('id', profileId).single()
  return canPrepareFullService(data?.booking_access_status)
}

// "Book a Standard Cleaning" / "Book a Deep Cleaning" on the dashboard. Keeps
// what they'd already chosen when switching between the two (Standard-only
// add-ons drop off for Deep, which includes them).
export async function startFullServiceAction(type: string): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Please sign in again.' }
  if (!FULL_SERVICE_CUSTOMER_ENABLED || !isFullServiceType(type)) return { error: 'This isn’t available yet.' }

  const admin = createAdminClient()
  if (!(await canPrepare(admin, session.profileId))) return { error: 'You can’t book Tidy Pros yet.' }

  const draft = await latestDraft(admin, session.profileId)
  const current = normalizeFullServiceSelection(draft?.full_service, { keepEstimate: true })
  const selection: FullServiceSelection = current
    ? { ...normalizeFullServiceSelection({ ...current, type })!, ...(current.estimate ? { estimate: current.estimate } : {}) }
    : emptySelection(type)

  const { error } = draft
    ? await admin.from('booking_drafts').update({ full_service: selection as never }).eq('id', draft.id)
    : await admin
        .from('booking_drafts')
        .insert({ customer_user_id: session.profileId, task_list: [] as never, full_service: selection as never, last_step_reached: 1 })
  if (error) return { error: 'That couldn’t be saved. Please try again.' }

  revalidatePath('/dashboard')
  return {}
}

export type FullServicePatch = Partial<Pick<FullServiceSelection, 'scope' | 'rooms' | 'addOns' | 'priorities'>>

// Saves one wizard step. Everything is checked again here (normalize), and the
// visit-length estimate can only ever come from the server: whatever the
// browser sends is dropped, and the stored one is kept (it's redone when the
// selection no longer matches it).
export async function saveFullServiceStepAction(
  patch: FullServicePatch,
  reached: WizardStep
): Promise<{ error?: string }> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return { error: 'Please sign in again.' }
  if (!isWizardStep(reached)) return { error: 'Something went wrong. Please try again.' }

  const admin = createAdminClient()
  const draft = await latestDraft(admin, session.profileId)
  const current = normalizeFullServiceSelection(draft?.full_service, { keepEstimate: true })
  if (!draft || !current) return { error: 'Start again from your Home page.' }

  const next = normalizeFullServiceSelection({
    ...current,
    ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
    ...(patch.rooms !== undefined ? { rooms: patch.rooms } : {}),
    ...(patch.addOns !== undefined ? { addOns: patch.addOns } : {}),
    ...(patch.priorities !== undefined ? { priorities: patch.priorities } : {}),
    step: furthestStep(current.step, reached),
  })
  if (!next) return { error: 'Something went wrong. Please try again.' }

  const { error } = await admin
    .from('booking_drafts')
    .update({ full_service: { ...next, ...(current.estimate ? { estimate: current.estimate } : {}) } as never })
    .eq('id', draft.id)
  if (error) return { error: 'That couldn’t be saved. Please try again.' }

  revalidatePath('/book/full-service', 'layout')
  return {}
}

// "Remove" on the dashboard. The draft goes too if nothing else is on it.
export async function clearFullServiceAction(): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'USER') return
  const admin = createAdminClient()
  const draft = await latestDraft(admin, session.profileId)
  if (!draft) return
  const tasks = (draft.task_list as unknown[] | null) ?? []
  if (tasks.length === 0) await admin.from('booking_drafts').delete().eq('id', draft.id)
  else await admin.from('booking_drafts').update({ full_service: null }).eq('id', draft.id)
  revalidatePath('/dashboard')
}
