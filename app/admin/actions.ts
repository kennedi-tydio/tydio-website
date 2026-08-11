'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { setAdminCookie, clearAdminCookie, isAdminAuthed } from '@/lib/auth/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, emailShell } from '@/lib/email'
import { researchAreaMarketPrice, researchStateMedianPrice } from '@/lib/marketPricing'

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

export async function researchMarketPriceAction(
  serviceAreaId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  const { data: area } = await admin
    .from('service_areas')
    .select('name, city, state')
    .eq('id', serviceAreaId)
    .single()

  if (!area) return

  try {
    const { price, summary } = await researchAreaMarketPrice(area)
    await admin.from('service_areas').update({
      market_price: price,
      market_price_summary: summary,
      market_price_researched_at: new Date().toISOString(),
    }).eq('id', serviceAreaId)
  } catch (err) {
    console.error('Market price research failed', err)
  }

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

// ─── State Pricing ────────────────────────────────────────────────────────────

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/

function parsePrice(raw: FormDataEntryValue | null): { value?: number; error?: string } {
  const str = (raw as string)?.trim()
  if (!str) return { error: 'Median 4-hour price is required' }
  if (!PRICE_PATTERN.test(str)) return { error: 'Price must be a valid amount with at most 2 decimal places' }
  const value = Number(str)
  if (!Number.isFinite(value) || value <= 0) return { error: 'Price must be greater than zero' }
  return { value }
}

export async function createStatePriceAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const state = (formData.get('state') as string)?.trim()
  if (!state) return { error: 'State is required' }

  const { value: price, error: priceError } = parsePrice(formData.get('median_four_hour_price'))
  if (priceError) return { error: priceError }

  const admin = createAdminClient()
  const { error } = await admin.from('state_pricing').insert({
    state,
    median_four_hour_price: price as number,
    pricing_active: true,
  })

  if (error) {
    if (error.code === '23505') return { error: `${state} already has a price — edit it below instead` }
    return { error: error.message }
  }

  revalidatePath('/admin/state-pricing')
  return { success: true }
}

export async function updateStatePriceAction(
  statePricingId: string,
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  if (!(await isAdminAuthed())) return { error: 'Unauthorized' }

  const { value: price, error: priceError } = parsePrice(formData.get('median_four_hour_price'))
  if (priceError) return { error: priceError }

  const admin = createAdminClient()
  const { error } = await admin
    .from('state_pricing')
    .update({ median_four_hour_price: price, updated_at: new Date().toISOString() })
    .eq('id', statePricingId)

  if (error) return { error: error.message }

  revalidatePath('/admin/state-pricing')
  return { success: true }
}

export async function activateStatePricingAction(
  statePricingId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin
    .from('state_pricing')
    .update({ pricing_active: true, updated_at: new Date().toISOString() })
    .eq('id', statePricingId)

  revalidatePath('/admin/state-pricing')
}

export async function deactivateStatePricingAction(
  statePricingId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin
    .from('state_pricing')
    .update({ pricing_active: false, updated_at: new Date().toISOString() })
    .eq('id', statePricingId)

  revalidatePath('/admin/state-pricing')
}

// AI-assisted suggestion for a state's median price (admin-triggered, not
// automatic) — creates or refreshes that state's state_pricing row.
export async function researchStatePriceAction(formData: FormData): Promise<void> {
  if (!(await isAdminAuthed())) return

  const state = (formData.get('state') as string)?.trim()
  if (!state) return

  const admin = createAdminClient()

  try {
    const { price } = await researchStateMedianPrice(state)

    const { data: existing } = await admin
      .from('state_pricing')
      .select('id')
      .eq('state', state)
      .maybeSingle()

    if (existing) {
      await admin
        .from('state_pricing')
        .update({ median_four_hour_price: price, pricing_active: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await admin.from('state_pricing').insert({ state, median_four_hour_price: price, pricing_active: true })
    }
  } catch (err) {
    console.error('State price research failed', err)
  }

  revalidatePath('/admin/state-pricing')
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

// ─── Cleaners (Tidy Pros) ───────────────────────────────────────────────────

export async function approveCleanerAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('tidypro_profiles').update({
    cleaner_status: 'approved',
    active_for_booking: true,
    approved_at: new Date().toISOString(),
    paused_at: null,
    pause_reason: null,
  }).eq('id', profileId)

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}

export async function pauseCleanerAction(
  profileId: string,
  _formData: FormData
): Promise<void> {
  if (!(await isAdminAuthed())) return

  const admin = createAdminClient()
  await admin.from('tidypro_profiles').update({
    cleaner_status: 'paused',
    active_for_booking: false,
    paused_at: new Date().toISOString(),
  }).eq('id', profileId)

  revalidatePath('/admin/users')
  revalidatePath('/admin')
}
