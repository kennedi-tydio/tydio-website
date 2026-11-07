import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { missingOnboardingSteps } from '@/lib/cleanerOnboarding'

type Admin = ReturnType<typeof createAdminClient>

// Emails the admin the first time a cleaner becomes bookable: approved, active, and
// nothing left in missingOnboardingSteps (the same rules search uses). Called after
// every save that could finish the last step, since they can be done in any order.
// Sent once per cleaner, recorded on tidypro_profiles (see 053_onboarding_complete_notified).
// Never throws, so a failure here can't break the save that triggered it.
export async function notifyIfOnboardingComplete(admin: Admin, proId: string): Promise<boolean> {
  try {
    const { data: tidyPro, error } = await admin
      .from('tidypro_profiles')
      .select(
        'cleaner_status, active_for_booking, onboarding_completed_notified_at, profile_photo_url, bio, availability, stripe_onboarding_completed, travel_radius_miles, latitude, longitude, city, state'
      )
      .eq('id', proId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!tidyPro || tidyPro.onboarding_completed_notified_at) return false
    if (tidyPro.cleaner_status !== 'approved' || !tidyPro.active_for_booking) return false
    if (missingOnboardingSteps(tidyPro).length > 0) return false

    // Claimed before sending, so two saves landing together can't both email.
    const { data: marked, error: markError } = await admin
      .from('tidypro_profiles')
      .update({ onboarding_completed_notified_at: new Date().toISOString() })
      .eq('id', proId)
      .is('onboarding_completed_notified_at', null)
      .select('id')
    if (markError) throw new Error(markError.message)
    if (!marked || marked.length === 0) return false

    const { data: profile } = await admin.from('profiles').select('email, first_name, last_name').eq('id', proId).maybeSingle()
    await emailAdmin({
      email: profile?.email ?? null,
      name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'A cleaner',
      location: [tidyPro.city, tidyPro.state].filter(Boolean).join(', '),
    })
    return true
  } catch (err) {
    console.error('Onboarding complete admin notification failed', proId, err)
    return false
  }
}

async function emailAdmin(cleaner: { email: string | null; name: string; location: string }): Promise<void> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const who = cleaner.email ? `${escapeHtml(cleaner.name)} (${escapeHtml(cleaner.email)})` : escapeHtml(cleaner.name)
  const where = cleaner.location ? ` in ${escapeHtml(cleaner.location)}` : ''
  const adminLink = cleaner.email ? `${siteUrl}/admin/users?search=${encodeURIComponent(cleaner.email)}` : `${siteUrl}/admin/users`
  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `${cleaner.name} finished onboarding and can take bookings`,
    htmlContent: emailShell(`
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">New cleaner ready for bookings</h2>
      <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
        ${who}${where} has finished every onboarding step and now shows up in search for customers.
      </p>
      <a href="${adminLink}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">View in admin</a>
    `),
  })
}
