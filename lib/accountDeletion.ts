import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { LATE_CANCEL_REASON } from '@/lib/bookingRequestGroups'
import { deleteMarketingContact, removeMarketingContact } from '@/lib/marketingContacts'

type Admin = ReturnType<typeof createAdminClient>

export const OPEN_BOOKINGS_MESSAGE =
  'You have upcoming or pending bookings. Cancel them, or wait until they are finished, before deleting your account.'
export const UNPAID_PAYOUT_MESSAGE =
  'A completed booking is still waiting on its Tidy Pro payout. Try again once it has been paid out, or email kennedicoats@tydioapp.com for help.'

// Folders in these buckets are named by profile id (see the upload actions).
const PROFILE_BUCKETS = ['profile-photos', 'insurance-documents']

// Deleting the profile row cascades to everything tied to it in the database:
// addresses, saved cards, drafts, push subscriptions, a Tidy Pro's profile and
// background check, and a customer's bookings (with their messages, payments and
// reviews). Reviews the person left on someone else stay, without their name.
//
// Refused while money or a visit is still in flight, the same rule denyCleaner
// follows: an open booking would leave the other person stranded, and a completed
// booking without a transfer means the Tidy Pro hasn't been paid yet.
//
// Files and the Stripe customer are cleaned up after the row is gone, best-effort:
// a failure there is logged rather than leaving the person with a half-deleted account.
// A Tidy Pro's Stripe Connect account is left alone — it belongs to them at Stripe
// and may still hold a balance on its way to their bank.
export async function deleteOwnAccount(admin: Admin, profileId: string): Promise<{ error: string } | { success: true }> {
  const asEitherSide = `user_id.eq.${profileId},tidy_pro_id.eq.${profileId}`

  const [{ data: open }, { data: openGroups }, { data: openIncidents }, { data: unpaid }] = await Promise.all([
    admin.from('bookings').select('id').or(asEitherSide).in('status', ['pending', 'scheduled']).limit(1),
    admin.from('booking_request_groups').select('id').eq('user_id', profileId).eq('status', 'open').limit(1),
    // A reported no-access or no-show the admin hasn't settled yet still has money to move.
    admin.from('bookings').select('id').or(asEitherSide).not('incident_type', 'is', null).is('incident_resolved_at', null).limit(1),
    admin
      .from('bookings')
      .select('id')
      .or(asEitherSide)
      .or(`status.eq.completed,cancelled_reason.eq.${LATE_CANCEL_REASON},incident_resolved_at.not.is.null`)
      .is('stripe_transfer_id', null)
      .gt('cleaner_pay', 0)
      .not('tidy_pro_id', 'is', null)
      .limit(1),
  ])
  if (open?.length || openGroups?.length || openIncidents?.length) return { error: OPEN_BOOKINGS_MESSAGE }
  if (unpaid?.length) return { error: UNPAID_PAYOUT_MESSAGE }

  const [{ data: profile }, { data: bookings }] = await Promise.all([
    admin.from('profiles').select('stripe_customer_id, email, role').eq('id', profileId).maybeSingle(),
    admin.from('bookings').select('id').eq('user_id', profileId),
  ])

  // Selecting the deleted row confirms it's really gone: a delete matching nothing isn't an error.
  const { data: removedRows, error } = await admin.from('profiles').delete().eq('id', profileId).select('id')
  if (error || !removedRows?.length) return { error: 'We could not delete your account. Please try again.' }

  const folders = [
    ...PROFILE_BUCKETS.map(bucket => ({ bucket, prefix: profileId })),
    ...(bookings ?? []).map(b => ({ bucket: 'task-photos', prefix: b.id })),
  ]
  await Promise.all(folders.map(({ bucket, prefix }) => removeFolder(admin, bucket, prefix)))

  if (profile?.stripe_customer_id) {
    await stripe.customers
      .del(profile.stripe_customer_id)
      .catch(err => console.error('[Tydio] Stripe customer delete failed:', err))
  }

  if (profile?.email) await removeFromMarketing(admin, profile.email, profile.role as 'USER' | 'TIDYPRO' | 'ADMIN')

  return { success: true }
}

// Takes the email off this account's Brevo marketing list. If the person has no
// other Tydio account (one email can hold a customer and a Tidy Pro account),
// the Brevo contact is deleted outright, as the Privacy Policy promises.
async function removeFromMarketing(admin: Admin, email: string, role: 'USER' | 'TIDYPRO' | 'ADMIN'): Promise<void> {
  try {
    const { data: others } = await admin.from('profiles').select('id').eq('email', email).limit(1)
    if (others?.length) await removeMarketingContact(email, role)
    else await deleteMarketingContact(email)
  } catch (err) {
    console.error('[Tydio] Removing Brevo marketing contact failed:', err)
  }
}

async function removeFolder(admin: Admin, bucket: string, prefix: string): Promise<void> {
  try {
    const { data: files } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
    if (!files?.length) return
    const { error } = await admin.storage.from(bucket).remove(files.map(f => `${prefix}/${f.name}`))
    if (error) throw error
  } catch (err) {
    console.error(`[Tydio] Removing ${bucket}/${prefix} failed:`, err)
  }
}
