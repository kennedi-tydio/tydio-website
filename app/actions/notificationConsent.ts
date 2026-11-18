'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { userFacingError } from '@/lib/userFacingError'
import { notifyIfOnboardingComplete } from '@/lib/onboardingComplete'
import { customerSmsPhoneUpdate, textingPhone } from '@/lib/smsPhone'

function tableForRole(role: 'USER' | 'TIDYPRO' | 'ADMIN'): 'profiles' | 'tidypro_profiles' | null {
  if (role === 'USER') return 'profiles'
  if (role === 'TIDYPRO') return 'tidypro_profiles'
  return null
}

function profilePathForRole(role: 'USER' | 'TIDYPRO'): string {
  return role === 'USER' ? '/dashboard/profile' : '/pro/profile'
}

export async function setSmsConsentAction(
  consent: 'opted_in' | 'declined',
  phone?: string
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || (session.role !== 'USER' && session.role !== 'TIDYPRO')) return { error: 'Not authorized' }

  const table = tableForRole(session.role)
  if (!table) return { error: 'Not authorized' }

  const admin = createAdminClient()

  if (consent === 'opted_in') {
    const trimmedPhone = phone?.trim()
    if (table === 'profiles') {
      // Customers keep the phone on their profile; a different number given
      // here is saved as their texting number (lib/smsPhone).
      const { data: existing } = await admin.from('profiles').select('phone, sms_phone').eq('id', session.profileId).maybeSingle()
      if (trimmedPhone) {
        const { error } = await admin
          .from('profiles')
          .update(customerSmsPhoneUpdate(existing?.phone ?? null, trimmedPhone))
          .eq('id', session.profileId)
        if (error) return { error: userFacingError(error) }
      } else if (!textingPhone(existing)) {
        return { error: 'Phone number required.' }
      }
    } else if (trimmedPhone) {
      await admin.from(table).update({ phone: trimmedPhone }).eq('id', session.profileId)
    } else {
      const { data: existing } = await admin.from(table).select('phone').eq('id', session.profileId).maybeSingle()
      if (!existing?.phone) return { error: 'Phone number required.' }
    }
  }

  const { error } = await admin.from(table).update({ sms_consent: consent }).eq('id', session.profileId)
  if (error) return { error: userFacingError(error) }

  revalidatePath(profilePathForRole(session.role))
  return { success: true }
}

export async function setPushConsentAction(
  consent: 'opted_in' | 'declined'
): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || (session.role !== 'USER' && session.role !== 'TIDYPRO')) return { error: 'Not authorized' }

  const table = tableForRole(session.role)
  if (!table) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin.from(table).update({ push_consent: consent }).eq('id', session.profileId)
  if (error) return { error: userFacingError(error) }

  // sendPush goes by subscription rows, not this flag, so turning push off
  // has to remove every device's subscription for the profile.
  if (consent === 'declined') {
    const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('profile_id', session.profileId)
    if (deleteError) return { error: userFacingError(deleteError) }
  }

  revalidatePath(profilePathForRole(session.role))
  return { success: true }
}

export async function setEmailNotificationsAction(enabled: boolean): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || (session.role !== 'USER' && session.role !== 'TIDYPRO')) return { error: 'Not authorized' }

  const table = tableForRole(session.role)
  if (!table) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin.from(table).update({ email_notifications_enabled: enabled }).eq('id', session.profileId)
  if (error) return { error: userFacingError(error) }

  revalidatePath(profilePathForRole(session.role))
  return { success: true }
}

export async function subscribeToPushAction(subscription: {
  endpoint: string
  keys: { p256dh: string; auth: string }
}): Promise<{ error: string } | { success: true }> {
  const session = await getSession()
  if (!session || (session.role !== 'USER' && session.role !== 'TIDYPRO')) return { error: 'Not authorized' }

  const admin = createAdminClient()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      profile_id: session.profileId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'endpoint' }
  )
  if (error) return { error: userFacingError(error) }

  // Push can be the last onboarding step while it's required (lib/pushRequirement).
  if (session.role === 'TIDYPRO') {
    await notifyIfOnboardingComplete(admin, session.profileId)
    revalidatePath('/pro/dashboard')
  }

  return { success: true }
}
