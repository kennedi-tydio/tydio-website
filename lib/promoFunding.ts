import type { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { TYDIO_ADMIN_EMAIL, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { RATE_LIMITS, isRateLimited, recordRateLimitEvent } from '@/lib/rateLimit'
import { resolveStatePricing, resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import { computeIsTopTidyPro, haversineDistanceMiles } from '@/lib/cleanerMatching'
import { cleanerPayoutForServicePrice, servicePriceForCleaner } from '@/lib/pricingRules'
import { dropUnmatchedLaundryLinks, bookedTaskName } from '@/lib/laundry'
import { USED_FILTER } from '@/lib/promoCodesData'
import {
  committedPromoShortfall,
  describePromoDiscount,
  promoDiscountAmount,
  promoShortfall,
  type PromoCode,
  type UnpaidPromoBooking,
} from '@/lib/promoCodes'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { combineWithFullService, priceTasksPart } from '@/lib/bookingPricing'
import type { FullServiceSelection } from '@/lib/fullService'
import { quoteForTidyPro } from '@/lib/fullServiceBooking'

type Admin = ReturnType<typeof createAdminClient>

// A promo discount comes out of Tydio's share, and when the discounted charge is smaller
// than the Tidy Pro's pay, their transfer is paid from Tydio's Stripe balance (see
// completeBookingPayout). Before a code is accepted, Tydio's available balance must
// cover what this booking would need on top of the customer's payment, after setting
// aside what earlier promo bookings still need. Otherwise the code is refused and the
// admin is emailed.

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// USD available to transfer now. Pending funds aren't counted: they can't be sent yet.
export async function availableStripeBalance(): Promise<number> {
  const balance = await stripe.balance.retrieve()
  const cents = balance.available.filter((b) => b.currency === 'usd').reduce((sum, b) => sum + b.amount, 0)
  return cents / 100
}

// What earlier promo bookings will still take from the balance when their Tidy Pros are paid.
export async function committedPromoShortfallFromDb(admin: Admin): Promise<number> {
  const { data, error } = await admin
    .from('bookings')
    .select('id, stripe_payment_intent_id, cleaner_pay, total_customer_charge')
    .not('promo_code_id', 'is', null)
    .is('stripe_transfer_id', null)
    .gt('cleaner_pay', 0)
    .or(USED_FILTER)
  if (error) throw error
  return committedPromoShortfall((data ?? []) as UnpaidPromoBooking[])
}

export type PromoBookingDetails = {
  promo: PromoCode
  customerId: string
  tidyProId: string
  date: string | null
  time: string | null
  tasks: TidyTask[]
  // The full, undiscounted booking price.
  servicePrice: number
}

export type PromoFundingResult =
  | { ok: true }
  | { ok: false; discount: number; cleanerPay: number; customerPays: number; shortfall: number; available: number | null; committed: number }

export async function checkPromoFunding(admin: Admin, details: PromoBookingDetails): Promise<PromoFundingResult> {
  const discount = promoDiscountAmount(details.servicePrice, details.promo)
  const cleanerPay = cleanerPayoutForServicePrice(details.servicePrice)
  const customerPays = round2(details.servicePrice - discount)
  // The card fee is added on top of customerPays, so customerPays is what Tydio nets.
  const shortfall = promoShortfall(cleanerPay, customerPays)
  if (shortfall <= 0) return { ok: true }

  // If Stripe can't be asked, the code isn't accepted: money Tydio may not have isn't promised.
  let available: number | null = null
  let committed = 0
  try {
    ;[available, committed] = await Promise.all([availableStripeBalance(), committedPromoShortfallFromDb(admin)])
  } catch (err) {
    console.error('[Tydio] Promo funding check failed:', err)
    return { ok: false, discount, cleanerPay, customerPays, shortfall, available: null, committed }
  }

  if (available - committed >= shortfall) return { ok: true }
  return { ok: false, discount, cleanerPay, customerPays, shortfall, available, committed }
}

export type PromoAlertStage = 'applied' | 'confirmed'

// Records a code refused for want of funds (shown on /admin/promo-codes) and emails the
// admin. At most once an hour per customer and code, so a customer pressing Apply again
// doesn't flood the inbox or the list.
export async function emailAdminPromoUnfunded(
  admin: Admin,
  details: PromoBookingDetails,
  result: Extract<PromoFundingResult, { ok: false }>,
  stage: PromoAlertStage
): Promise<void> {
  const key = `promo-funding-alert:${details.promo.id}:${details.customerId}`
  if (await isRateLimited(admin, key, RATE_LIMITS.promoFundingAlert)) return
  await recordRateLimitEvent(admin, key)

  const { data: people } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', [details.customerId, details.tidyProId])
  const person = (id: string) => {
    const p = people?.find((x) => x.id === id)
    if (!p) return '—'
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ')
    return name ? `${name} (${p.email})` : p.email
  }

  const money = (n: number | null) => (n == null ? 'Could not be checked' : `$${n.toFixed(2)}`)
  const needed = result.available == null ? null : round2(result.shortfall + result.committed - result.available)
  const taskNames = details.tasks.map(bookedTaskName)

  const { error: recordError } = await admin.from('promo_code_failures').insert({
    promo_code_id: details.promo.id,
    code: details.promo.code,
    discount_label: describePromoDiscount(details.promo),
    stage,
    customer_id: details.customerId,
    customer_label: person(details.customerId),
    tidy_pro_id: details.tidyProId,
    tidy_pro_label: person(details.tidyProId),
    scheduled_date: details.date,
    scheduled_time: details.time,
    task_names: taskNames,
    service_price: details.servicePrice,
    discount: result.discount,
    customer_pays: result.customerPays,
    cleaner_pay: result.cleanerPay,
    shortfall: result.shortfall,
    available_balance: result.available,
    committed: result.committed,
  })
  if (recordError) console.error('[Tydio] Recording promo funding failure failed:', recordError.message)

  const rows: [string, string][] = [
    ['Promo code', `${details.promo.code} (${describePromoDiscount(details.promo)})`],
    ['When', stage === 'applied' ? 'The customer applied the code at checkout' : 'The customer confirmed the booking'],
    ['Customer', person(details.customerId)],
    ['Tidy Pro', person(details.tidyProId)],
    ['Date', [details.date, details.time].filter(Boolean).join(' at ') || '—'],
    ['Tasks', taskNames.length ? taskNames.join(', ') : '—'],
    ['Booking price (full)', money(details.servicePrice)],
    ['Promo discount', money(result.discount)],
    ['Customer would pay (before card fee)', money(result.customerPays)],
    ['Tidy Pro payout (80% of full price)', money(result.cleanerPay)],
    ['Available Stripe balance', money(result.available)],
    ['Already set aside for other promo bookings', money(result.committed)],
  ]
  if (needed != null) rows.push(['Add at least this to cover it', money(Math.max(needed, 0))])

  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(value)}</td></tr>`
    )
    .join('')

  await sendEmail({
    to: [{ email: TYDIO_ADMIN_EMAIL }],
    subject: `Not enough in Stripe to cover promo code ${details.promo.code}`,
    htmlContent: emailShell(`
      <div style="margin:0 0 24px;padding:20px;border-radius:12px;background:#FEF2F2;text-align:center;">
        <p style="margin:0 0 4px;color:#991B1B;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Tydio would have to cover</p>
        <p style="margin:0;color:#B91C1C;font-size:40px;font-weight:800;line-height:1.1;">${escapeHtml(money(result.shortfall))}</p>
        ${needed != null && needed > 0 ? `<p style="margin:8px 0 0;color:#7F1D1D;font-size:13px;">Add at least ${escapeHtml(money(needed))} to your Stripe balance to cover it.</p>` : ''}
      </div>
      <p style="margin:0 0 12px;color:#0f172a;font-size:16px;font-weight:600;">A promo code was turned away</p>
      <p style="margin:0 0 20px;color:#334155;font-size:14px;line-height:1.6;">
        There are insufficient funds in Tydio&rsquo;s Stripe account to cover this discount, so the customer was told
        &ldquo;Promo code is no longer valid.&rdquo; They can still book at full price. Add funds to the Stripe balance
        for the code to work again.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;">${table}</table>
    `),
  }).catch((err) => console.error('[Tydio] Promo funding alert email failed:', err))
}

// Checks funding and, if it falls short, emails the admin. True when the code can be used.
export async function ensurePromoFunded(admin: Admin, details: PromoBookingDetails, stage: PromoAlertStage | null): Promise<boolean> {
  const result = await checkPromoFunding(admin, details)
  if (result.ok) return true
  if (stage) await emailAdminPromoUnfunded(admin, details, result, stage)
  return false
}

// The draft's full booking price with its chosen Tidy Pro, worked out the same way as the
// review page and placeBooking. Null if it can't be priced yet (no Tidy Pro, no pricing).
export async function quoteDraftServicePrice(
  admin: Admin,
  input: {
    customerId: string
    tidyProId: string
    taskList: TidyTask[]
    location: ScheduledLocation | null
    // Standard / Deep Cleaning on the draft, priced with this Tidy Pro's rates.
    fullService?: FullServiceSelection | null
  }
): Promise<{ servicePrice: number; tasks: TidyTask[] } | null> {
  const tasks = dropUnmatchedLaundryLinks(input.taskList.filter((t) => t.completed))
  const fullService = input.fullService ?? null
  if (tasks.length === 0 && !fullService) return null

  const [{ data: profile }, { data: tidyPro }] = await Promise.all([
    admin.from('profiles').select('service_area_id, city, state').eq('id', input.customerId).single(),
    admin
      .from('tidypro_profiles')
      .select('rating, total_accepted_bookings, latitude, longitude')
      .eq('id', input.tidyProId)
      .maybeSingle(),
  ])
  const statePricing = await resolveStatePricing(admin, profile?.service_area_id ?? null, profile ?? undefined)
  if (!statePricing.configured) return null

  const squareFootage = await resolveLocationSquareFootage(admin, input.customerId, input.location)
  let breakdown
  try {
    breakdown = priceTasksPart(tasks, statePricing.state, statePricing.medianFourHourPrice, squareFootage)
  } catch {
    return null
  }
  if (fullService) {
    const quote = await quoteForTidyPro(admin, input.tidyProId, fullService, squareFootage)
    if (!quote) return null
    breakdown = combineWithFullService(breakdown, quote)
  }

  const location = input.location
  const isTopTidyPro = tidyPro ? computeIsTopTidyPro(tidyPro.rating, tidyPro.total_accepted_bookings) : false
  const distanceMiles =
    location?.latitude != null && location?.longitude != null && tidyPro?.latitude != null && tidyPro?.longitude != null
      ? haversineDistanceMiles(
          { latitude: location.latitude, longitude: location.longitude },
          { latitude: tidyPro.latitude, longitude: tidyPro.longitude }
        )
      : null

  return { servicePrice: servicePriceForCleaner(breakdown.total_customer_charge, { isTopTidyPro, distanceMiles }), tasks }
}
