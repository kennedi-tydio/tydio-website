import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { formatDuration, formatSearchDate, formatSearchTime } from '@/lib/unmetBookingSearches'

type Admin = ReturnType<typeof createAdminClient>

// Abandoned-cart tracking (see 081_pricing_quotes). Whenever a customer is shown prices
// (the Tidy Pro list, or the review page's final total) we save what they were quoted,
// one row per booking draft. Booking marks it booked. A quote left alone for
// ABANDON_AFTER_MINUTES after the last price they saw is marked abandoned and the admin
// is emailed the tasks and prices, once. The admin's Abandoned Carts page compares
// booked and abandoned quotes by price.

export const ABANDON_AFTER_MINUTES = 60

export type QuoteStage = 'cleaners' | 'review'

export interface PricingView {
  customerId: string
  draftId: string
  stage: QuoteStage
  taskNames: string[]
  durationMinutes: number | null
  date: string | null
  time: string | null
  locationLabel: string | null
  // The Tidy Pro list: each Tidy Pro's price for these tasks.
  cleanerPrices?: number[]
  // The review page.
  review?: { tidyProId: string; servicePrice: number; totalPrice: number }
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function taskLabel(task: { name: string; room?: string | null }): string {
  return task.room ? `${task.name} (${task.room})` : task.name
}

// Saves what the customer was just shown. Never throws, since it must not get in the
// way of the page showing them their prices.
export async function recordPricingView(admin: Admin, view: PricingView, now: Date = new Date()): Promise<void> {
  try {
    const prices = (view.cleanerPrices ?? []).filter((p) => Number.isFinite(p) && p > 0)
    const details = {
      task_names: view.taskNames,
      duration_minutes: view.durationMinutes,
      scheduled_date: view.date,
      scheduled_time: view.time,
      location_label: view.locationLabel,
      last_viewed_at: now.toISOString(),
      updated_at: now.toISOString(),
      ...(view.stage === 'cleaners' && prices.length > 0
        ? { cleaner_count: prices.length, lowest_price: round2(Math.min(...prices)), highest_price: round2(Math.max(...prices)) }
        : {}),
      ...(view.review
        ? {
            selected_tidy_pro_id: view.review.tidyProId,
            review_service_price: round2(view.review.servicePrice),
            review_total_price: round2(view.review.totalPrice),
          }
        : {}),
    }

    const { data: existing, error: lookupError } = await admin
      .from('pricing_quotes')
      .select('id, stage, view_count, booked_at')
      .eq('draft_id', view.draftId)
      .maybeSingle()
    if (lookupError) throw new Error(lookupError.message)

    if (existing) {
      if (existing.booked_at) return
      // The furthest step they reached is kept, so going back to the list doesn't hide
      // that they saw a final total.
      const stage: QuoteStage = existing.stage === 'review' || view.stage === 'review' ? 'review' : 'cleaners'
      const { error } = await admin
        .from('pricing_quotes')
        .update({ ...details, stage, view_count: existing.view_count + 1 })
        .eq('id', existing.id)
      if (error) throw new Error(error.message)
      return
    }

    const { error } = await admin.from('pricing_quotes').insert({
      customer_user_id: view.customerId,
      draft_id: view.draftId,
      stage: view.stage,
      first_viewed_at: now.toISOString(),
      ...details,
    })
    // A view in another tab saved it a moment ago; that one counts.
    if (error && error.code !== '23505') throw new Error(error.message)
  } catch (err) {
    console.error('[Tydio] Recording pricing view failed:', err)
  }
}

// Called once the booking is placed, before the draft is cleared.
export async function markQuoteBooked(admin: Admin, draftId: string, bookingId: string, now: Date = new Date()): Promise<void> {
  const { error } = await admin
    .from('pricing_quotes')
    .update({ booked_at: now.toISOString(), booking_id: bookingId, updated_at: now.toISOString() })
    .eq('draft_id', draftId)
    .is('booked_at', null)
  if (error) console.error('[Tydio] Marking quote booked failed:', draftId, error.message)
}

// ── Abandonment ─────────────────────────────────────────────────────────────

export type QuoteRow = {
  id: string
  customer_user_id: string
  draft_id: string | null
  stage: QuoteStage
  task_names: string[]
  duration_minutes: number | null
  scheduled_date: string | null
  scheduled_time: string | null
  location_label: string | null
  cleaner_count: number | null
  lowest_price: number | null
  highest_price: number | null
  selected_tidy_pro_id: string | null
  review_service_price: number | null
  review_total_price: number | null
  view_count: number
  first_viewed_at: string
  last_viewed_at: string
  booked_at: string | null
  abandoned_at: string | null
}

const QUOTE_COLUMNS =
  'id, customer_user_id, draft_id, stage, task_names, duration_minutes, scheduled_date, scheduled_time, location_label, cleaner_count, lowest_price, highest_price, selected_tidy_pro_id, review_service_price, review_total_price, view_count, first_viewed_at, last_viewed_at, booked_at, abandoned_at'

// The price that counts for a quote: the final total if they reached review, otherwise
// the cheapest Tidy Pro they were offered.
export function quotedPrice(q: Pick<QuoteRow, 'review_total_price' | 'lowest_price'>): number | null {
  const price = q.review_total_price ?? q.lowest_price
  return price == null ? null : Number(price)
}

export function money(value: number | null | undefined): string {
  return value == null ? '—' : `$${Number(value).toFixed(2)}`
}

export function priceRange(q: Pick<QuoteRow, 'lowest_price' | 'highest_price'>): string {
  if (q.lowest_price == null) return '—'
  if (q.highest_price == null || Number(q.highest_price) === Number(q.lowest_price)) return money(q.lowest_price)
  return `${money(q.lowest_price)} – ${money(q.highest_price)}`
}

export const STAGE_LABELS: Record<QuoteStage, string> = {
  cleaners: 'Choosing a Tidy Pro',
  review: 'Booking review',
}

function formatEastern(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })
}

type Customer = { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; city: string | null; state: string | null }

export function abandonedQuoteEmailHtml(quote: QuoteRow, customer: Customer | null, tidyProName: string | null): string {
  const p = 'margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;'
  const th = 'padding:6px 12px 6px 0;color:#94a3b8;font-size:13px;font-weight:600;vertical-align:top;white-space:nowrap;text-align:left;'
  const td = 'padding:6px 0;color:#1a2332;font-size:14px;vertical-align:top;'
  const name = `${customer?.first_name ?? ''} ${customer?.last_name ?? ''}`.trim() || 'A customer'
  const area = [customer?.city, customer?.state].filter(Boolean).join(', ')
  const when = quote.scheduled_date
    ? `${formatSearchDate(quote.scheduled_date)}${quote.scheduled_time ? ` at ${formatSearchTime(quote.scheduled_time)}` : ''}`
    : 'Any day'

  const rows: [string, string][] = [
    ['Customer', escapeHtml(name)],
    ['Email', customer?.email ? escapeHtml(customer.email) : '—'],
    ['Phone', customer?.phone ? escapeHtml(customer.phone) : '—'],
    ['Home area', area ? escapeHtml(area) : '—'],
    ['Left at', escapeHtml(STAGE_LABELS[quote.stage])],
  ]
  if (quote.review_total_price != null) {
    rows.push(
      ['Tidy Pro', escapeHtml(tidyProName ?? '—')],
      ['Service price', money(quote.review_service_price)],
      ['Total shown', `<strong>${money(quote.review_total_price)}</strong> (incl. card processing fee)`]
    )
  }
  if (quote.lowest_price != null) {
    const count = quote.cleaner_count ?? 0
    rows.push(['Tidy Pro prices', `${escapeHtml(priceRange(quote))}${count > 0 ? ` across ${count} Tidy Pro${count === 1 ? '' : 's'}` : ''}`])
  }
  rows.push(
    ['Requested', escapeHtml(when)],
    ['Est. length', quote.duration_minutes ? escapeHtml(formatDuration(quote.duration_minutes)) : '—'],
    ['Location', quote.location_label ? escapeHtml(quote.location_label) : '—'],
    ['Tasks', quote.task_names.length > 0 ? quote.task_names.map(escapeHtml).join('<br/>') : '—'],
    ['Pricing views', String(quote.view_count)],
    ['First saw prices', escapeHtml(formatEastern(quote.first_viewed_at))],
    ['Last saw prices', escapeHtml(formatEastern(quote.last_viewed_at))]
  )

  return emailShell(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a2332;">Abandoned cart: ${money(quotedPrice(quote))}</h2>
    <p style="${p}">${escapeHtml(name)} saw their price and left without booking. They've been inactive for over ${ABANDON_AFTER_MINUTES} minutes.</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">
      ${rows.map(([label, value]) => `<tr><th style="${th}">${label}</th><td style="${td}">${value}</td></tr>`).join('')}
    </table>
    <a href="${siteUrl()}/admin/abandoned-carts" style="display:inline-block;padding:14px 28px;background:#38C7CA;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">View abandoned carts</a>
  `)
}

async function emailAdminAbandonedQuote(admin: Admin, quote: QuoteRow): Promise<void> {
  const [{ data: customer }, { data: pro }] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, email, phone, city, state').eq('id', quote.customer_user_id).maybeSingle(),
    quote.selected_tidy_pro_id
      ? admin.from('profiles').select('first_name, last_name').eq('id', quote.selected_tidy_pro_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const name = `${customer?.first_name ?? ''} ${customer?.last_name ?? ''}`.trim() || 'A customer'
  const tidyProName = pro ? [pro.first_name, pro.last_name].filter(Boolean).join(' ') || null : null
  const taskCount = quote.task_names.length

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `Abandoned cart: ${name} left at ${money(quotedPrice(quote))} (${taskCount} task${taskCount === 1 ? '' : 's'})`,
    htmlContent: abandonedQuoteEmailHtml(quote, customer, tidyProName),
  })
}

// Run on a schedule. Quotes idle past the cutoff are marked abandoned and emailed, once.
// Booking marks a quote booked as it's placed (markQuoteBooked), so it's never picked up here.
export async function checkAbandonedQuotes(
  admin: Admin,
  now: Date = new Date()
): Promise<{ checked: number; abandoned: number; emailed: number }> {
  const result = { checked: 0, abandoned: 0, emailed: 0 }
  const cutoff = new Date(now.getTime() - ABANDON_AFTER_MINUTES * 60_000).toISOString()

  const { data: quotes, error } = await admin
    .from('pricing_quotes')
    .select(QUOTE_COLUMNS)
    .is('booked_at', null)
    .is('abandoned_at', null)
    .lt('last_viewed_at', cutoff)
    .order('last_viewed_at', { ascending: true })
    .limit(50)
  if (error) throw new Error(`Couldn't load pricing quotes: ${error.message}`)

  for (const quote of (quotes ?? []) as QuoteRow[]) {
    result.checked++
    try {
      // Claimed first, so the email only ever goes out once.
      const { data: claimed } = await admin
        .from('pricing_quotes')
        .update({ abandoned_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('id', quote.id)
        .is('abandoned_at', null)
        .is('booked_at', null)
        .select('id')
      if (!claimed || claimed.length === 0) continue
      result.abandoned++

      await emailAdminAbandonedQuote(admin, quote)
      await admin.from('pricing_quotes').update({ admin_notified_at: new Date().toISOString() }).eq('id', quote.id)
      result.emailed++
    } catch (err) {
      console.error('[Tydio] Abandoned quote check failed:', quote.id, err)
    }
  }

  return result
}

// ── Analysis for the admin page ───────────────────────────────────────────────

export type QuoteOutcome = 'booked' | 'abandoned' | 'open'

export function quoteOutcome(q: Pick<QuoteRow, 'booked_at' | 'abandoned_at'>): QuoteOutcome {
  if (q.booked_at) return 'booked'
  if (q.abandoned_at) return 'abandoned'
  return 'open'
}

export interface QuoteStats {
  quotes: number
  booked: number
  abandoned: number
  open: number
  // Of the quotes that ended (booked or abandoned); null with none.
  bookingRate: number | null
  avgBookedPrice: number | null
  avgAbandonedPrice: number | null
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round2(values.reduce((a, b) => a + b, 0) / values.length)
}

type Summarizable = Pick<QuoteRow, 'booked_at' | 'abandoned_at' | 'review_total_price' | 'lowest_price'>

export function summarizeQuotes(rows: Summarizable[]): QuoteStats {
  const booked = rows.filter((r) => quoteOutcome(r) === 'booked')
  const abandoned = rows.filter((r) => quoteOutcome(r) === 'abandoned')
  const ended = booked.length + abandoned.length
  const prices = (list: Summarizable[]) => list.map(quotedPrice).filter((p): p is number => p != null)
  return {
    quotes: rows.length,
    booked: booked.length,
    abandoned: abandoned.length,
    open: rows.length - ended,
    bookingRate: ended === 0 ? null : booked.length / ended,
    avgBookedPrice: average(prices(booked)),
    avgAbandonedPrice: average(prices(abandoned)),
  }
}

export const PRICE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: 'Under $75', min: 0, max: 75 },
  { label: '$75 – $100', min: 75, max: 100 },
  { label: '$100 – $150', min: 100, max: 150 },
  { label: '$150 – $200', min: 150, max: 200 },
  { label: '$200 – $300', min: 200, max: 300 },
  { label: '$300+', min: 300, max: Infinity },
]

// Booked vs. abandoned at each price band, by the price that counted for each quote.
export function statsByPriceBucket(rows: Summarizable[]): ({ label: string } & QuoteStats)[] {
  return PRICE_BUCKETS.map((bucket) => {
    const inBucket = rows.filter((r) => {
      const price = quotedPrice(r)
      return price != null && price >= bucket.min && price < bucket.max
    })
    return { label: bucket.label, ...summarizeQuotes(inBucket) }
  })
}
