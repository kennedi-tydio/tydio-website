'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { addMarketingContact } from '@/lib/marketingContacts'
import { readMarketingOptInToken } from '@/lib/waitlistEmail'

// The confirm button on /email-updates. It's a button, not the email link itself,
// because email security scanners open links automatically, and that mustn't
// count as someone agreeing to marketing email.
export async function optInToEmailsAction(formData: FormData): Promise<void> {
  const token = formData.get('token') as string | null
  const profileId = await readMarketingOptInToken(token)
  if (!profileId) redirect('/email-updates')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .update({ marketing_opt_in_at: new Date().toISOString() })
    .eq('id', profileId)
    .is('marketing_opt_in_at', null)
    .select('email, first_name, last_name, role')
    .maybeSingle()

  // Already opted in (or the account is gone): nothing more to do.
  if (profile) {
    await addMarketingContact({
      email: profile.email,
      firstName: profile.first_name ?? '',
      lastName: profile.last_name ?? '',
      role: profile.role as 'USER' | 'TIDYPRO' | 'ADMIN',
    }).catch((err) => console.error('[Tydio] Adding Brevo marketing contact failed:', err))
  }

  redirect(`/email-updates?token=${encodeURIComponent(token!)}&done=1`)
}
