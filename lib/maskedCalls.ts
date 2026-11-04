import type { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/bannedUsers'
import { DEFAULT_BOOKING_TIME_ZONE, bookingStartInstant } from '@/lib/bookingTime'
import { RATE_LIMITS, isRateLimited, recordRateLimitEvent } from '@/lib/rateLimit'
import { publicSiteUrl, twilioClient } from '@/lib/twilio'

type Admin = ReturnType<typeof createAdminClient>

// Customers and Tidy Pros never see each other's numbers. Tapping Call rings the
// caller's own phone from Tydio's number, and once they press 1, Twilio dials the
// other person, who also sees only Tydio's number. See /api/webhooks/twilio/voice.

export type CallerRole = 'USER' | 'TIDYPRO'

export type CallableBooking = {
  id: string
  user_id: string
  tidy_pro_id: string | null
  status: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  estimated_duration_minutes: number | null
  time_zone: string | null
}

const CALLABLE_BOOKING_COLUMNS =
  'id, user_id, tidy_pro_id, status, scheduled_date, scheduled_time, estimated_duration_minutes, time_zone'

// How long after a booking's expected end the two sides can still call, for a
// forgotten item or a question about the job.
export const CALL_GRACE_MINUTES = 120

export const CALL_WINDOW_MESSAGE = 'Calling is available once your booking is confirmed until 2 hours after it ends.'

// From the cleaner accepting until the grace period after the booking ends. Not on
// requests nobody has accepted, or on canceled bookings.
export function canCall(booking: Omit<CallableBooking, 'id' | 'user_id'>, now: Date = new Date()): boolean {
  if (booking.status !== 'scheduled' && booking.status !== 'completed') return false
  if (!booking.tidy_pro_id || !booking.scheduled_date || !booking.scheduled_time) return false
  const start = bookingStartInstant(booking.scheduled_date, booking.scheduled_time, booking.time_zone ?? DEFAULT_BOOKING_TIME_ZONE)
  const endOfWindow = start.getTime() + ((booking.estimated_duration_minutes ?? 60) + CALL_GRACE_MINUTES) * 60 * 1000
  return now.getTime() <= endOfWindow
}

// Phones are saved as typed. US numbers get +1; anything already in international
// form keeps its country code.
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = normalizePhone(raw)
  if (digits.length === 10) return `+1${digits}`
  if (raw.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return null
}

export function otherRole(role: CallerRole): CallerRole {
  return role === 'USER' ? 'TIDYPRO' : 'USER'
}

export async function loadCallableBooking(admin: Admin, bookingId: string): Promise<CallableBooking | null> {
  const { data } = await admin.from('bookings').select(CALLABLE_BOOKING_COLUMNS).eq('id', bookingId).maybeSingle()
  return (data as CallableBooking | null) ?? null
}

// Customers' phones are on their profile; a Tidy Pro's is on their Tidy Pro profile.
export async function partyPhone(admin: Admin, booking: CallableBooking, role: CallerRole): Promise<string | null> {
  const { data } =
    role === 'USER'
      ? await admin.from('profiles').select('phone').eq('id', booking.user_id).maybeSingle()
      : booking.tidy_pro_id
        ? await admin.from('tidypro_profiles').select('phone').eq('id', booking.tidy_pro_id).maybeSingle()
        : { data: null }
  return toE164(data?.phone)
}

export function bridgeUrl(siteUrl: string, bookingId: string, leg: CallerRole, step?: 'connect'): string {
  const query = new URLSearchParams({ booking: bookingId, leg, ...(step ? { step } : {}) })
  return `${siteUrl}/api/webhooks/twilio/voice?${query}`
}

export async function startMaskedCall(
  admin: Admin,
  bookingId: string,
  caller: { role: CallerRole; profileId: string }
): Promise<{ success: true } | { error: string }> {
  const booking = await loadCallableBooking(admin, bookingId)
  const ownerId = caller.role === 'USER' ? booking?.user_id : booking?.tidy_pro_id
  if (!booking || ownerId !== caller.profileId) return { error: 'Booking not found.' }
  if (!canCall(booking)) return { error: CALL_WINDOW_MESSAGE }

  const [callerPhone, calleePhone] = await Promise.all([
    partyPhone(admin, booking, caller.role),
    partyPhone(admin, booking, otherRole(caller.role)),
  ])
  if (!callerPhone) return { error: 'Add a phone number to your profile to make calls.' }
  if (!calleePhone) {
    const them = caller.role === 'USER' ? 'Your Tidy Pro' : 'This customer'
    return { error: `${them} doesn't have a phone number we can call. Send them a message instead.` }
  }

  const rateKey = `call:${bookingId}:${caller.role}`
  if (await isRateLimited(admin, rateKey, RATE_LIMITS.maskedCallPerBooking)) {
    return { error: 'A call is already on its way to your phone. Wait a minute before trying again.' }
  }

  const siteUrl = publicSiteUrl()
  if (!siteUrl) {
    console.error('[Tydio] Masked call needs NEXT_PUBLIC_SITE_URL for the Twilio callback')
    return { error: "Calling isn't available right now. Send a message instead." }
  }

  try {
    const call = await twilioClient().calls.create({
      to: callerPhone,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: bridgeUrl(siteUrl, bookingId, caller.role),
      timeout: 25,
      statusCallback: `${siteUrl}/api/webhooks/twilio/voice/status`,
    })
    await recordRateLimitEvent(admin, rateKey)
    const { error } = await admin
      .from('booking_calls')
      .insert({ booking_id: bookingId, caller_role: caller.role, twilio_call_sid: call.sid, status: call.status })
    if (error) console.error('[Tydio] Recording masked call failed:', error.message)
  } catch (err) {
    console.error('[Tydio] Starting masked call failed:', err)
    return { error: "We couldn't start the call. Please try again." }
  }

  return { success: true }
}
