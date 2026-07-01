'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { setAdminCookie, clearAdminCookie, isAdminAuthed } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, emailShell } from '@/lib/email'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function adminLoginAction(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const secret = formData.get('secret') as string
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return { error: 'Invalid password' }
  }
  await setAdminCookie()
  redirect('/admin')
}

export async function adminLogoutAction(_formData: FormData): Promise<void> {
  await clearAdminCookie()
  redirect('/admin/login')
}

// ─── Service Areas ────────────────────────────────────────────────────────────

export async function createServiceAreaAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const name = (formData.get('name') as string)?.trim()
  const city = (formData.get('city') as string)?.trim() || null
  const statusRaw = (formData.get('status') as string) ?? 'waitlist_only'
  const status = statusRaw as 'waitlist_only' | 'beta_open' | 'paused_recruiting_cleaners' | 'closed'

  if (!name) return { error: 'Name is required' }

  const admin = createAdminClient()
  const { error } = await admin.from('service_areas').insert({ name, city, status })
  if (error) return { error: error.message }

  revalidatePath('/admin/service-areas')
  return { success: true }
}

export async function addZipCodeAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const serviceAreaId = formData.get('service_area_id') as string
  const zipCode = (formData.get('zip_code') as string)?.trim()

  if (!serviceAreaId || !zipCode) return { error: 'Missing fields' }
  if (!/^\d{5}$/.test(zipCode)) return { error: 'ZIP must be 5 digits' }

  const admin = createAdminClient()
  const { error } = await admin.from('service_area_zip_codes').insert({
    service_area_id: serviceAreaId,
    zip_code: zipCode,
  })

  if (error) {
    if (error.code === '23505') return { error: `ZIP ${zipCode} is already in this area` }
    return { error: error.message }
  }

  // If the area is already active, immediately grant access to waitlisted users in this ZIP
  const { data: area } = await admin
    .from('service_areas')
    .select('status')
    .eq('id', serviceAreaId)
    .single()

  if (area?.status === 'beta_open') {
    const { data: waitlistedUsers } = await admin
      .from('profiles')
      .select('id, email, first_name')
      .eq('zip_code', zipCode)
      .eq('booking_access_status', 'waitlisted')
      .eq('role', 'USER')

    const users = waitlistedUsers ?? []
    if (users.length > 0) {
      await admin.from('profiles').update({
        booking_access_status: 'booking_allowed',
        service_area_id: serviceAreaId,
        booking_access_granted_at: new Date().toISOString(),
        waitlisted: false,
      }).in('id', users.map(u => u.id))

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
      await Promise.allSettled(users.map(user =>
        sendEmail({
          to: [{ email: user.email, name: user.first_name ?? undefined }],
          subject: 'Tydio is now available in your area!',
          htmlContent: emailShell(`
            <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
              Great news, ${user.first_name ?? 'neighbor'}!
            </h2>
            <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
              Tydio Beta is now live in your area. You can now browse vetted Tidy Pros
              and book your first cleaning — right from the app or website!
            </p>
            <a href="${siteUrl}/dashboard"
               style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
              Book a cleaning
            </a>
            <p style="margin:0;color:#94a3b8;font-size:13px;">
              You were notified because you signed up for the Tydio waitlist.
            </p>
          `),
        })
      ))
    }

    revalidatePath('/admin')
  }

  revalidatePath('/admin/service-areas')
  return { success: true }
}

export async function activateAreaAction(
  serviceAreaId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()

  const { data: area } = await admin
    .from('service_areas')
    .select('id, name, status')
    .eq('id', serviceAreaId)
    .single()

  if (!area) return

  const { data: zipRows } = await admin
    .from('service_area_zip_codes')
    .select('zip_code')
    .eq('service_area_id', serviceAreaId)

  const zips = (zipRows ?? []).map(r => r.zip_code)
  if (zips.length === 0) return

  if (area.status !== 'beta_open') {
    await admin
      .from('service_areas')
      .update({ status: 'beta_open', updated_at: new Date().toISOString() })
      .eq('id', serviceAreaId)
  }

  const { data: waitlistedUsers } = await admin
    .from('profiles')
    .select('id, email, first_name')
    .in('zip_code', zips)
    .eq('booking_access_status', 'waitlisted')
    .eq('role', 'USER')

  const users = waitlistedUsers ?? []

  if (users.length > 0) {
    await admin.from('profiles').update({
      booking_access_status: 'booking_allowed',
      service_area_id: serviceAreaId,
      booking_access_granted_at: new Date().toISOString(),
      waitlisted: false,
    }).in('id', users.map(u => u.id))

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    await Promise.allSettled(users.map(user =>
      sendEmail({
        to: [{ email: user.email, name: user.first_name ?? undefined }],
        subject: 'Tydio is now available in your area!',
        htmlContent: emailShell(`
          <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
            Great news, ${user.first_name ?? 'neighbor'}!
          </h2>
          <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
            Tydio Beta is now live in your area. You can now browse vetted Tidy Pros
            and book your first cleaning — right from the app.
          </p>
          <a href="${siteUrl}/dashboard"
             style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
            Book a cleaning
          </a>
          <p style="margin:0;color:#94a3b8;font-size:13px;">
            You were notified because you signed up for the Tydio waitlist.
          </p>
        `),
      })
    ))
  }

  await admin.from('service_area_activation_events').insert({
    service_area_id: serviceAreaId,
    previous_status: area.status,
    new_status: 'beta_open',
    users_notified_count: users.length,
  })

  revalidatePath('/admin/service-areas')
  revalidatePath('/admin')
}

export async function pauseAreaAction(
  serviceAreaId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('service_areas').update({
    status: 'paused_recruiting_cleaners',
    updated_at: new Date().toISOString(),
  }).eq('id', serviceAreaId)

  revalidatePath('/admin/service-areas')
}

export async function deleteZipCodeAction(
  zipId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('service_area_zip_codes').delete().eq('id', zipId)
  revalidatePath('/admin/service-areas')
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function grantAccessAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('profiles').update({
    booking_access_status: 'booking_allowed',
    booking_access_granted_at: new Date().toISOString(),
    waitlisted: false,
  }).eq('id', profileId)

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

export async function revokeAccessAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('profiles').update({
    booking_access_status: 'waitlisted',
    booking_access_granted_at: null,
    waitlisted: true,
  }).eq('id', profileId)

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}
