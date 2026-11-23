// Loads the customer's booking draft for the Standard / Deep Cleaning wizard
// (app/book/full-service). The selection lives on the same draft as their
// Tidy Tasks (booking_drafts.full_service), so one checkout covers both.

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  FULL_SERVICE_CUSTOMER_ENABLED,
  WIZARD_STEPS,
  isCompleteSelection,
  normalizeFullServiceSelection,
  type FullServiceSelection,
  type WizardStep,
} from '@/lib/fullService'
import type { TidyTask } from '@/app/dashboard/types'

export type WizardDraft = {
  draftId: string
  selection: FullServiceSelection
  tasks: TidyTask[]
  notes: string
  customRooms: string[]
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step)
}

export function furthestStep(a: WizardStep, b: WizardStep): WizardStep {
  return stepIndex(a) >= stepIndex(b) ? a : b
}

// For a wizard page: signed-in customer who can book, with a selection on
// their latest draft. Later steps need the rooms chosen first.
export async function loadWizardDraft(step: WizardStep): Promise<WizardDraft> {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')
  if (!FULL_SERVICE_CUSTOMER_ENABLED) redirect('/dashboard')

  const admin = createAdminClient()
  const [{ data: profile }, { data: draft }] = await Promise.all([
    admin.from('profiles').select('booking_access_status, custom_rooms').eq('id', session.profileId).single(),
    admin
      .from('booking_drafts')
      .select('id, task_list, notes, full_service')
      .eq('customer_user_id', session.profileId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (profile?.booking_access_status !== 'booking_allowed') redirect('/dashboard')

  const selection = normalizeFullServiceSelection(draft?.full_service, { keepEstimate: true })
  if (!draft || !selection) redirect('/dashboard')
  if (step !== 'scope' && !isCompleteSelection(selection)) redirect('/book/full-service/scope')

  return {
    draftId: draft.id,
    selection,
    tasks: (draft.task_list as TidyTask[] | null) ?? [],
    notes: draft.notes ?? '',
    customRooms: (profile?.custom_rooms as string[] | null) ?? [],
  }
}
