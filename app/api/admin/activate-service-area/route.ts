import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, emailShell } from '@/lib/email'

// POST /api/admin/activate-service-area
// Body: { service_area_id: string, secret: string }
//
// 1. Verifies the admin secret
// 2. Finds all waitlisted users whose zip_code is in service_area_zip_codes for this area
// 3. Updates them to booking_access_status = 'booking_allowed', sets service_area_id
// 4. Sends each a branded notification email
// 5. Logs the event in service_area_activation_events

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { service_area_id, secret } = body as { service_area_id?: string; secret?: string }

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!service_area_id) {
    return NextResponse.json({ error: 'service_area_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Get the service area
  const { data: area } = await admin
    .from('service_areas')
    .select('id, name, status')
    .eq('id', service_area_id)
    .single()

  if (!area) return NextResponse.json({ error: 'Service area not found' }, { status: 404 })

  // Get all zip codes in this area
  const { data: zipRows } = await admin
    .from('service_area_zip_codes')
    .select('zip_code')
    .eq('service_area_id', service_area_id)

  const zips = (zipRows ?? []).map(r => r.zip_code)
  if (zips.length === 0) {
    return NextResponse.json({ error: 'No zip codes in this service area' }, { status: 400 })
  }

  // Ensure the area is set to beta_open
  if (area.status !== 'beta_open') {
    await admin
      .from('service_areas')
      .update({ status: 'beta_open', updated_at: new Date().toISOString() })
      .eq('id', service_area_id)
  }

  // Find waitlisted users in those zips
  const { data: waitlistedUsers } = await admin
    .from('profiles')
    .select('id, email, first_name')
    .in('zip_code', zips)
    .eq('booking_access_status', 'waitlisted')
    .eq('role', 'USER')

  const users = waitlistedUsers ?? []

  if (users.length > 0) {
    // Bulk update their status
    await admin
      .from('profiles')
      .update({
        booking_access_status: 'booking_allowed',
        service_area_id,
        booking_access_granted_at: new Date().toISOString(),
      })
      .in('id', users.map(u => u.id))

    // Send notification emails
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    await Promise.allSettled(
      users.map(user =>
        sendEmail({
          to: [{ email: user.email, name: user.first_name ?? undefined }],
          subject: 'Tydio is now available in your area! 🎉',
          htmlContent: emailShell(`
            <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">
              Great news, ${user.first_name ?? 'neighbor'}!
            </h2>
            <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
              Tydio Beta is now live in your area. You can now browse vetted Tidy Pros
              and book your first cleaning — right from the app.
            </p>
            <a href="${siteUrl}/login"
               style="display:inline-block;margin:8px 0 20px;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">
              Book a cleaning
            </a>
            <p style="margin:0;color:#94a3b8;font-size:13px;">
              You were notified because you signed up for the Tydio waitlist.
            </p>
          `),
        })
      )
    )
  }

  // Log the activation event
  await admin.from('service_area_activation_events').insert({
    service_area_id,
    previous_status: area.status,
    new_status: 'beta_open',
    users_notified_count: users.length,
  })

  return NextResponse.json({
    ok: true,
    area: area.name,
    zips,
    usersNotified: users.length,
  })
}
