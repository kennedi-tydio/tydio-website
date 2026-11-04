'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { BanAppealError, submitAppeal } from '@/lib/banAccount'
import { submitBackgroundCheckAppeal } from '@/lib/backgroundCheckAppeals'

export type AppealState = { error?: string; submitted?: boolean }

// The token is either a ban's or a background check denial's.
export async function submitAppealAction(_prev: AppealState, formData: FormData): Promise<AppealState> {
  const token = (formData.get('token') as string | null) ?? ''
  const message = (formData.get('message') as string | null) ?? ''
  if (!token) return { error: 'This appeal link is invalid.' }

  const admin = createAdminClient()
  try {
    const { data: ban } = await admin.from('banned_users').select('id').eq('appeal_token', token).maybeSingle()
    if (ban) await submitAppeal(admin, token, message)
    else await submitBackgroundCheckAppeal(admin, token, message)
  } catch (err) {
    if (err instanceof BanAppealError) return { error: err.message }
    console.error('[Tydio] Appeal submission failed:', err)
    return { error: 'We could not send your appeal. Please try again.' }
  }
  return { submitted: true }
}
