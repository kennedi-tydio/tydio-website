import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'

type Admin = ReturnType<typeof createAdminClient>

export const SUSPENDED_MESSAGE = `Your Tydio account is suspended, so you can't book or take bookings right now. If you think this is a mistake, please email ${TYDIO_ADMIN_EMAIL}.`

export const SUSPENDED_PAUSE_REASON = 'Account suspended'

// A suspended person can still sign in and see their account, but can't book or take
// bookings: see bookingBlockedBySuspension, checked wherever a booking is made or
// accepted. A Tidy Pro is also paused, which takes them out of search. Upcoming
// bookings are canceled separately by cancelBookingsForAccounts (lib/accountBookingCancellation).
// Admin accounts are never touched. With `notify`, each newly suspended person is
// emailed (a ban sends its own email instead). Returns how many were newly suspended.
export async function suspendAccounts(
  admin: Admin,
  profileIds: string[],
  { notify = false }: { notify?: boolean } = {}
): Promise<number> {
  if (profileIds.length === 0) return 0
  const now = new Date().toISOString()

  const { data: suspended, error } = await admin
    .from('profiles')
    .update({ suspended_at: now })
    .in('id', profileIds)
    .neq('role', 'ADMIN')
    .is('suspended_at', null)
    .select('id, role, email, first_name')
  if (error) throw new Error(error.message)

  const proIds = (suspended ?? []).filter(p => p.role === 'TIDYPRO').map(p => p.id)
  if (proIds.length > 0) {
    const { error: pauseError } = await admin
      .from('tidypro_profiles')
      .update({ cleaner_status: 'paused', active_for_booking: false, paused_at: now, pause_reason: SUSPENDED_PAUSE_REASON })
      .in('id', proIds)
    if (pauseError) throw new Error(pauseError.message)
  }

  if (notify) await Promise.all((suspended ?? []).map(sendSuspensionEmail))

  return suspended?.length ?? 0
}

// A failed email never undoes the suspension.
async function sendSuspensionEmail(to: { email: string | null; first_name: string | null }): Promise<void> {
  if (!to.email) return
  const p = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'
  try {
    await sendEmail({
      to: [{ email: to.email, name: to.first_name ?? undefined }],
      subject: 'Your Tydio account has been suspended',
      htmlContent: emailShell(`
        <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
          Hi ${escapeHtml(to.first_name ?? 'there')},
        </h2>
        <p style="${p}">Your Tydio account has been suspended. You can still sign in and see your account, but you can't book or take bookings while it's suspended. Any upcoming bookings have been canceled.</p>
        <p style="${p}">If you think this is a mistake, please contact support at <a href="mailto:${TYDIO_ADMIN_EMAIL}" style="color:#38C7CA;">${TYDIO_ADMIN_EMAIL}</a>.</p>
      `),
    })
  } catch (err) {
    console.error('[Tydio] Suspension email failed:', err)
  }
}

// Lets them book again. A Tidy Pro stays paused until an admin approves them,
// so nobody starts getting jobs again without someone deciding they should.
export async function unsuspendAccounts(admin: Admin, profileIds: string[]): Promise<number> {
  if (profileIds.length === 0) return 0

  const { data, error } = await admin
    .from('profiles')
    .update({ suspended_at: null })
    .in('id', profileIds)
    .not('suspended_at', 'is', null)
    .select('id')
  if (error) throw new Error(error.message)

  return data?.length ?? 0
}

export const WAITLISTED_BOOKING_MESSAGE = "You're on the waitlist and can't book Tidy Pros right now. We'll notify you as soon as you can."

// The error to show when a customer without booking access (waitlisted, paused,
// closed, denied) tries to book, or null.
export async function bookingBlockedByAccess(admin: Admin, profileId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('booking_access_status').eq('id', profileId).maybeSingle()
  if (data?.booking_access_status === 'booking_allowed') return null
  return data?.booking_access_status === 'waitlisted' ? WAITLISTED_BOOKING_MESSAGE : 'Booking isn’t available for your account right now.'
}

// The error to show when someone suspended tries to book or accept a booking, or null.
export async function bookingBlockedBySuspension(admin: Admin, profileId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('suspended_at').eq('id', profileId).maybeSingle()
  return data?.suspended_at ? SUSPENDED_MESSAGE : null
}
