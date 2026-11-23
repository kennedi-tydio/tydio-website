import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { MAX_TRAVEL_RADIUS_MILES, findAvailableCleaners, type CleanerMatch } from '@/lib/cleanerMatching'
import { normalizeServices, serviceLabels, type TidyProService } from '@/lib/tidyProServices'
import { DEFAULT_BOOKING_TIME_ZONE, hasAcceptanceWindowClosed, isValidTimeZone, todayInZone } from '@/lib/bookingTime'
import { notifyCustomer } from '@/lib/customerNotifications'
import { notifyCleanerAvailable } from '@/lib/notifications'
import { loadRates } from '@/lib/fullServiceRates'

type Admin = ReturnType<typeof createAdminClient>

// When a customer's search finds no Tidy Pros, we save it and email the admin the
// booking details, once per booking draft. When a Tidy Pro finishes onboarding and
// can take bookings, the open searches near them are checked against them, and each
// customer they can serve is sent their profile (see 067_unmet_booking_searches).

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export function formatSearchDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${WEEKDAYS_SHORT[date.getUTCDay()]}, ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`
}

export function formatSearchTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

// "Fri, Nov 20" or "Fri, Nov 20 – Wed, Nov 25".
export function formatSearchDates(date: string, endDate?: string | null): string {
  return endDate ? `${formatSearchDate(date)} – ${formatSearchDate(endDate)}` : formatSearchDate(date)
}

// "9:00 AM" or "9:00 AM – 1:00 PM".
export function formatSearchTimes(time: string, endTime?: string | null): string {
  return endTime ? `${formatSearchTime(time)} – ${formatSearchTime(endTime)}` : formatSearchTime(time)
}

// "Fri, Nov 20 at 9:00 AM", "Fri, Nov 20", "any day at 9:00 AM", "any day", and with
// ranges "Fri, Nov 20 – Wed, Nov 25, starting 9:00 AM – 1:00 PM".
export function describeSearchTime(date: string | null, time: string | null, endDate?: string | null, endTime?: string | null): string {
  const day = date ? formatSearchDates(date, endDate) : 'any day'
  if (!time) return day
  return endTime ? `${day}, starting ${formatSearchTimes(time, endTime)}` : `${day} at ${formatSearchTime(time)}`
}

// For the customer's message: " on Fri, Nov 20 at 9:00 AM", " at 9:00 AM", or "" for any
// day, anytime. With ranges, " between Fri, Nov 20 and Wed, Nov 25, starting between
// 9:00 AM and 1:00 PM".
export function searchTimePhrase(date: string | null, time: string | null, endDate?: string | null, endTime?: string | null): string {
  const day = date ? (endDate ? ` between ${formatSearchDate(date)} and ${formatSearchDate(endDate)}` : ` on ${formatSearchDate(date)}`) : ''
  if (!time) return day
  return endTime
    ? `${day}${day ? ',' : ''} starting between ${formatSearchTime(time)} and ${formatSearchTime(endTime)}`
    : `${day} at ${formatSearchTime(time)}`
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

// Whether the date and time the customer asked for can no longer be booked. With a
// range, that's once its last date and latest start time have gone by.
export function hasSearchTimePassed(
  search: { scheduled_date: string | null; scheduled_time: string | null; scheduled_end_date?: string | null; scheduled_end_time?: string | null },
  now: Date,
  timeZone: string
): boolean {
  if (!search.scheduled_date) return false
  const lastDate = search.scheduled_end_date ?? search.scheduled_date
  const lastTime = search.scheduled_end_time ?? search.scheduled_time
  if (lastTime) return hasAcceptanceWindowClosed(lastDate, lastTime, now, timeZone)
  return lastDate < todayInZone(timeZone, now)
}

export interface UnmetSearchInput {
  customerId: string
  draftId: string
  location: { latitude: number; longitude: number; label: string | null }
  date: string | null
  // The end of a date range or start-time window, if they searched with one.
  endDate?: string | null
  time: string | null
  endTime?: string | null
  // The customer's browser zone; falls back to Eastern if missing or unknown.
  timeZone: string | null
  durationMinutes: number
  requiredServices: TidyProService[]
  tasks: { name: string; room?: string | null }[]
  estimatedPrice: number | null
}

function taskName(task: { name: string; room?: string | null }): string {
  return task.room ? `${task.name} (${task.room})` : task.name
}

// Saves the search and, the first time for this draft, emails the admin. Searching
// again with no results just updates the saved details. Returns false if nothing
// was saved, so the customer isn't promised a notification that won't come.
export async function recordUnmetSearch(admin: Admin, input: UnmetSearchInput): Promise<boolean> {
  const details = {
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    location_label: input.location.label,
    scheduled_date: input.date,
    scheduled_end_date: input.endDate ?? null,
    scheduled_time: input.time,
    scheduled_end_time: input.endTime ?? null,
    time_zone: isValidTimeZone(input.timeZone) ? input.timeZone : DEFAULT_BOOKING_TIME_ZONE,
    duration_minutes: input.durationMinutes,
    required_services: input.requiredServices,
    task_names: input.tasks.map(taskName),
    estimated_price: input.estimatedPrice,
  }

  const { data: open, error: openError } = await admin
    .from('unmet_booking_searches')
    .select('id, search_count')
    .eq('draft_id', input.draftId)
    .is('closed_at', null)
    .maybeSingle()
  if (openError) throw new Error(`Couldn't look up unmet search: ${openError.message}`)

  if (open) {
    const { error } = await admin
      .from('unmet_booking_searches')
      .update({ ...details, search_count: open.search_count + 1, updated_at: new Date().toISOString() })
      .eq('id', open.id)
    if (error) throw new Error(`Couldn't update unmet search: ${error.message}`)
    return true
  }

  const { data: inserted, error: insertError } = await admin
    .from('unmet_booking_searches')
    .insert({ customer_user_id: input.customerId, draft_id: input.draftId, ...details })
    .select('id')
    .single()
  // Another search for the same draft saved it first; that one emails the admin.
  if (insertError?.code === '23505') return true
  if (insertError || !inserted) throw new Error(`Couldn't save unmet search: ${insertError?.message}`)

  try {
    await emailAdminUnmetSearch(admin, input)
    await admin.from('unmet_booking_searches').update({ admin_notified_at: new Date().toISOString() }).eq('id', inserted.id)
  } catch (err) {
    console.error('[Tydio] Unmet search admin email failed:', err)
  }
  return true
}

// A later search for this draft found Tidy Pros, so there's nobody to wait for.
export async function closeUnmetSearch(admin: Admin, draftId: string): Promise<void> {
  await admin
    .from('unmet_booking_searches')
    .update({ closed_at: new Date().toISOString(), closed_reason: 'found_in_search', updated_at: new Date().toISOString() })
    .eq('draft_id', draftId)
    .is('closed_at', null)
}

export function unmetSearchAdminEmailHtml(
  customer: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; city: string | null; state: string | null; zip_code: string | null } | null,
  input: UnmetSearchInput
): string {
  const p = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'
  const th = 'padding:6px 12px 6px 0;color:#94a3b8;font-size:13px;font-weight:600;vertical-align:top;white-space:nowrap;text-align:left;'
  const td = 'padding:6px 0;color:#1a2332;font-size:14px;vertical-align:top;'
  const name = `${customer?.first_name ?? ''} ${customer?.last_name ?? ''}`.trim() || 'A customer'
  const area = [customer?.city, customer?.state, customer?.zip_code].filter(Boolean).join(', ')
  const { latitude, longitude } = input.location
  const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`
  const services = serviceLabels(input.requiredServices)

  const rows: [string, string][] = [
    ['Customer', escapeHtml(name)],
    ['Email', customer?.email ? escapeHtml(customer.email) : '—'],
    ['Phone', customer?.phone ? escapeHtml(customer.phone) : '—'],
    ['Location', `${escapeHtml(input.location.label ?? 'Current location')}<br/><a href="${mapUrl}" style="color:#38C7CA;">View on map</a>`],
    ['Home area', area ? escapeHtml(area) : '—'],
    ['Date', input.date ? escapeHtml(formatSearchDates(input.date, input.endDate)) : 'Any day'],
    ['Time', input.time ? escapeHtml(input.endTime ? `Starting ${formatSearchTimes(input.time, input.endTime)}` : formatSearchTime(input.time)) : 'Anytime'],
    ['Est. length', escapeHtml(formatDuration(input.durationMinutes))],
    ['Est. price', input.estimatedPrice ? `$${input.estimatedPrice.toFixed(2)}` : '—'],
    ['Services', services.length > 0 ? escapeHtml(services.join(', ')) : '—'],
    ['Tasks', input.tasks.length > 0 ? input.tasks.map((t) => escapeHtml(taskName(t))).join('<br/>') : '—'],
  ]

  const adminLink = customer?.email
    ? `${siteUrl()}/admin/users?search=${encodeURIComponent(customer.email)}`
    : `${siteUrl()}/admin/users`

  return emailShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">No Tidy Pros available</h2>
    <p style="${p}">${escapeHtml(name)} searched for a booking and no Tidy Pros matched. We'll tell them automatically if one becomes available.</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">
      ${rows.map(([label, value]) => `<tr><th style="${th}">${label}</th><td style="${td}">${value}</td></tr>`).join('')}
    </table>
    <a href="${adminLink}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">View in admin</a>
  `)
}

async function emailAdminUnmetSearch(admin: Admin, input: UnmetSearchInput): Promise<void> {
  const { data: customer } = await admin
    .from('profiles')
    .select('first_name, last_name, email, phone, city, state, zip_code')
    .eq('id', input.customerId)
    .maybeSingle()

  const name = `${customer?.first_name ?? ''} ${customer?.last_name ?? ''}`.trim() || 'A customer'
  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `No Tidy Pros available for ${name} (${describeSearchTime(input.date, input.time, input.endDate, input.endTime)})`,
    htmlContent: unmetSearchAdminEmailHtml(customer, input),
  })
}


// ── A Tidy Pro becomes bookable ──────────────────────────────────────────────

const MILES_PER_DEGREE = 69

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'A Tidy Pro'
}

export function cleanerAvailableEmailHtml(opts: {
  customerFirstName: string | null
  cleaner: CleanerMatch
  bio: string | null
  when: string
  profileUrl: string
}): string {
  const { cleaner } = opts
  const p = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'
  const first = escapeHtml(firstName(cleaner.name))
  const bio = opts.bio && opts.bio.length > 280 ? `${opts.bio.slice(0, 277).trimEnd()}…` : opts.bio
  const rating = cleaner.reviewCount > 0
    ? `&#9733; ${cleaner.rating.toFixed(1)} &middot; ${cleaner.reviewCount} review${cleaner.reviewCount === 1 ? '' : 's'}`
    : 'New Tidy Pro'
  const badges = [cleaner.isVerified ? 'Verified' : null, `${cleaner.distanceMiles} miles away`].filter(Boolean).join(' &middot; ')
  const photo = cleaner.photoUrl
    ? `<img src="${escapeHtml(cleaner.photoUrl)}" alt="" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:32px;object-fit:cover;border:0;" />`
    : ''

  return emailShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Good news, ${escapeHtml(opts.customerFirstName || 'there')}!</h2>
    <p style="${p}">You searched for a cleaning and nobody was available. ${first} just joined Tydio near you and can take your booking${escapeHtml(opts.when)}.</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 20px;background:#f8fafc;border-radius:16px;">
      <tr>
        ${photo ? `<td style="padding:16px 0 16px 16px;width:64px;vertical-align:top;">${photo}</td>` : ''}
        <td style="padding:16px;vertical-align:top;">
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1a2332;">${escapeHtml(cleaner.name)}${cleaner.isTopTidyPro ? ' <span style="font-size:11px;font-weight:600;color:#38C7CA;">Top Tidy Pro</span>' : ''}</p>
          <p style="margin:0 0 4px;font-size:13px;color:#475569;">${rating}</p>
          <p style="margin:0;font-size:13px;color:#94a3b8;">${badges}</p>
          ${bio ? `<p style="margin:10px 0 0;font-size:14px;color:#475569;line-height:1.5;">${escapeHtml(bio)}</p>` : ''}
        </td>
      </tr>
    </table>
    <a href="${escapeHtml(opts.profileUrl)}" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">View ${first}&rsquo;s profile</a>
    <p style="margin:20px 0 0;color:#94a3b8;font-size:13px;">You received this because you searched for a cleaning on Tydio and no Tidy Pros were available.</p>
  `)
}

async function sendCleanerAvailable(
  admin: Admin,
  customerId: string,
  cleaner: CleanerMatch,
  bio: string | null,
  when: string
): Promise<void> {
  const profileUrl = `${siteUrl()}/book/schedule/${cleaner.id}`

  // Text and push; the email is our own, so it can show the profile.
  await notifyCustomer(admin, customerId, notifyCleanerAvailable(firstName(cleaner.name), profileUrl, when), { email: false })

  const { data: customer } = await admin
    .from('profiles')
    .select('email, first_name, email_notifications_enabled')
    .eq('id', customerId)
    .maybeSingle()
  if (!customer?.email || customer.email_notifications_enabled === false) return

  await sendEmail({
    to: [{ email: customer.email, name: customer.first_name ?? undefined }],
    subject: `${firstName(cleaner.name)} is now available for your Tydio booking`,
    htmlContent: cleanerAvailableEmailHtml({ customerFirstName: customer.first_name, cleaner, bio, when, profileUrl }),
  }).catch((err) => console.error('[Tydio] Cleaner available email failed:', err))
}

// Called once, when a Tidy Pro first finishes every onboarding step and can take
// bookings (notifyIfOnboardingComplete). Each open search near them is checked as if
// the customer made it now, by the same rules as search. If the date they asked for
// has passed, being in range and offering the services is enough. Each customer they
// can serve is sent their profile, once.
export async function notifyCustomersOfNewCleaner(
  admin: Admin,
  cleanerId: string,
  now: Date = new Date()
): Promise<{ checked: number; notified: number; removed: number }> {
  const result = { checked: 0, notified: 0, removed: 0 }

  const { data: pro } = await admin
    .from('tidypro_profiles')
    .select('latitude, longitude, travel_radius_miles, bio')
    .eq('id', cleanerId)
    .maybeSingle()
  if (!pro || pro.latitude == null || pro.longitude == null) return result
  const radius = Math.min(pro.travel_radius_miles ?? 0, MAX_TRAVEL_RADIUS_MILES)
  if (radius <= 0) return result

  // A box around them first; search's exact distance check does the rest.
  const dLat = radius / MILES_PER_DEGREE
  const dLng = radius / (MILES_PER_DEGREE * Math.max(Math.cos((pro.latitude * Math.PI) / 180), 0.01))
  const { data: searches, error } = await admin
    .from('unmet_booking_searches')
    .select('id, customer_user_id, draft_id, latitude, longitude, scheduled_date, scheduled_end_date, scheduled_time, scheduled_end_time, time_zone, duration_minutes, required_services')
    .is('closed_at', null)
    .gte('latitude', pro.latitude - dLat)
    .lte('latitude', pro.latitude + dLat)
    .gte('longitude', pro.longitude - dLng)
    .lte('longitude', pro.longitude + dLng)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Couldn't load unmet searches: ${error.message}`)

  const told = new Set<string>()
  // Standard / Deep Cleaning also needs a price set for it (lib/fullServiceRates).
  const rates = await loadRates(admin, cleanerId)
  for (const search of searches ?? []) {
    result.checked++
    try {
      // Booked or deleted: the draft is gone.
      if (!search.draft_id) {
        await admin
          .from('unmet_booking_searches')
          .update({ closed_at: now.toISOString(), closed_reason: 'draft_removed', updated_at: now.toISOString() })
          .eq('id', search.id)
          .is('closed_at', null)
        result.removed++
        continue
      }

      const timeZone = isValidTimeZone(search.time_zone) ? search.time_zone : DEFAULT_BOOKING_TIME_ZONE
      const passed = hasSearchTimePassed(search, now, timeZone)
      // A date range that's partly over is checked from today on.
      const today = todayInZone(timeZone, now)
      const fromDate =
        search.scheduled_date && search.scheduled_end_date && search.scheduled_date < today ? today : search.scheduled_date
      const [match] = await findAvailableCleaners(
        {
          latitude: search.latitude,
          longitude: search.longitude,
          date: passed ? null : fromDate,
          endDate: passed ? null : search.scheduled_end_date,
          time: passed ? null : search.scheduled_time,
          endTime: passed ? null : search.scheduled_end_time,
          durationMinutes: search.duration_minutes,
          requiredServices: normalizeServices(search.required_services),
          onlyCleanerId: cleanerId,
        },
        admin
      )
      if (!match) continue
      const needed = normalizeServices(search.required_services)
      if ((needed.includes('standardCleaning') && !rates.standard) || (needed.includes('deepCleaning') && !rates.deep)) continue

      // Claimed before telling them, so it's only ever sent once.
      const { data: claimed } = await admin
        .from('unmet_booking_searches')
        .update({
          closed_at: now.toISOString(),
          closed_reason: 'cleaner_available',
          customer_notified_at: now.toISOString(),
          notified_tidy_pro_id: cleanerId,
          updated_at: now.toISOString(),
        })
        .eq('id', search.id)
        .is('closed_at', null)
        .select('id')
      if (!claimed || claimed.length === 0) continue

      // A customer with more than one open search hears about this Tidy Pro once.
      if (told.has(search.customer_user_id)) continue
      told.add(search.customer_user_id)

      const when = passed ? '' : searchTimePhrase(search.scheduled_date, search.scheduled_time, search.scheduled_end_date, search.scheduled_end_time)
      await sendCleanerAvailable(admin, search.customer_user_id, match, pro.bio, when)
      result.notified++
    } catch (err) {
      console.error('[Tydio] Checking unmet search failed:', search.id, err)
    }
  }

  return result
}
