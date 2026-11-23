import { describe, it, expect, beforeAll } from 'vitest'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { getOrCreateStripeCustomerId } from '@/lib/stripe/customer'
import { refreshPayoutOnboardingStatus } from '@/lib/stripe/connect'
import { stripePercentageForPaymentMethod } from '@/lib/stripe/cardFees'
import { createFeeCheckoutSession } from '@/lib/stripe/backgroundCheckFee'
import { placeBooking, type BookingToPlace } from '@/lib/placeBooking'
import { refundBookingTotal, cancelBookingAsAdmin, LATE_CANCEL_REASON } from '@/lib/bookingRequestGroups'
import { requestUpcharge, getPendingUpcharge, payUpcharge, upchargeCustomerCharge } from '@/lib/bookingUpcharges'
import { payForVisit } from '@/lib/recurringPayments'
import { completeBookingPayout } from '@/lib/bookings'
import { refundCompletedBooking } from '@/lib/bookingPayoutAdjustment'
import { holdPayout } from '@/lib/adminPayout'
import { isLateCancellation } from '@/lib/bookingTime'
import { lateCancelCleanerPay } from '@/lib/pricingRules'
import type { TidyTask } from '@/app/dashboard/types'
import fs from 'node:fs'
import { admin, assertTestMode, readState, LOG_FILE, TEST_LAT, TEST_LNG, type TestState } from './shared'

const TZ = 'America/New_York'
let s: TestState
const db = admin()

// --- helpers -------------------------------------------------------------------------

const task = (id: string): TidyTask =>
  ({ id, name: 'Wipe down bathroom sink', room: 'Bathroom', notes: '', dirtLevel: 'standard', unusual: [], completed: true, tier: 'Standard' }) as TidyTask

function dateInDays(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + days * 86_400_000))
}

// Local date and HH:MM in TZ, `minutes` from now.
function localSlot(minutes: number): { date: string; time: string } {
  const at = new Date(Date.now() + minutes * 60_000)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
  return { date, time }
}

async function addCard(token: string): Promise<string> {
  const customer = await getOrCreateStripeCustomerId(s.customerId)
  expect(customer).toMatch(/^cus_/)
  const pm = await stripe.paymentMethods.attach(token, { customer })
  const { data, error } = await db
    .from('payment_methods')
    .insert({
      user_id: s.customerId,
      stripe_payment_method_id: pm.id,
      card_brand: pm.card!.brand,
      card_last4: pm.card!.last4,
      card_exp_month: pm.card!.exp_month,
      card_exp_year: pm.card!.exp_year,
    })
    .select('id')
    .single()
  if (error) throw error
  return data!.id
}

let visa: string
let declined: string
let homeAddressId: string
let day = 10

// Every booking needs a saved address with the home's size (placeBooking), so the test
// customer gets one: the same "Stripe Test Home" ui-setup.e2e.ts makes.
async function ensureTestHome(): Promise<string> {
  const address = {
    user_id: s.customerId,
    label: 'Stripe Test Home',
    street_address: '1 Test Rd',
    city: 'Thomasville',
    state: 'GA',
    zip_code: '31792',
    latitude: TEST_LAT,
    longitude: TEST_LNG,
    is_default: true,
    square_footage: '1000_1999',
  }
  const { data: existing } = await db.from('user_addresses').select('id').eq('user_id', s.customerId).eq('label', address.label).maybeSingle()
  if (existing) {
    const { error } = await db.from('user_addresses').update(address).eq('id', existing.id)
    if (error) throw error
    return existing.id
  }
  const { data, error } = await db.from('user_addresses').insert(address).select('id').single()
  if (error) throw error
  return data!.id
}

async function book(overrides: Partial<BookingToPlace> = {}) {
  const result = await placeBooking(db, {
    customerId: s.customerId,
    tidyProId: s.proId,
    date: dateInDays(day++),
    time: '10:00',
    timeZone: TZ,
    location: { type: 'address', addressId: homeAddressId, label: 'Stripe Test Home', line: '1 Test Rd, Thomasville, GA', latitude: TEST_LAT, longitude: TEST_LNG },
    taskList: [task('t1')],
    notes: null,
    entryInstructions: null,
    suppliesProvided: true,
    paymentMethodId: visa,
    ...overrides,
  })
  if ('error' in result) throw new Error('placeBooking: ' + result.error)
  const { data: booking } = await db.from('bookings').select('*').eq('id', result.bookingId).single()
  return { ...result, booking: booking! }
}

async function accept(bookingId: string) {
  await db.from('bookings').update({ status: 'scheduled', decision_status: 'accepted' }).eq('id', bookingId)
}

async function charge(paymentIntentId: string) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] })
  const ch = pi.latest_charge as Stripe.Charge
  const bt = ch.balance_transaction as Stripe.BalanceTransaction | null
  return { status: pi.status, received: pi.amount_received, refunded: ch.amount_refunded, fee: bt?.fee ?? null, chargeId: ch.id }
}

const log = (label: string, data: unknown) => fs.appendFileSync(LOG_FILE, `[${label}] ${JSON.stringify(data)}
`)

// --- flows ---------------------------------------------------------------------------

describe('Stripe test mode: payments and refunds', () => {
  beforeAll(async () => {
    assertTestMode()
    s = readState()
    homeAddressId = await ensureTestHome()
    visa = await addCard('pm_card_visa')
    declined = await addCard('pm_card_chargeCustomerFail')
  })

  it('test Tidy Pro finished payout onboarding', async () => {
    const done = await refreshPayoutOnboardingStatus(s.proId, s.proAccountId!)
    expect(done).toBe(true)
  })

  it('1. booking payment charges the card the quoted total', async () => {
    const { total, booking } = await book()
    const c = await charge(booking.stripe_payment_intent_id)
    log('booking', { total, ...c })
    expect(c.status).toBe('succeeded')
    expect(c.received).toBe(Math.round(total * 100))
    expect(Number(booking.total_customer_charge)).toBe(total)
    expect(booking.status).toBe('pending')
  })

  it('2. declined card: no booking is created and nothing is charged', async () => {
    const date = dateInDays(day++)
    const result = await placeBooking(db, {
      customerId: s.customerId, tidyProId: s.proId, date, time: '10:00', timeZone: TZ,
      location: { type: 'current_location', latitude: TEST_LAT, longitude: TEST_LNG },
      taskList: [task('t1')], notes: null, entryInstructions: null, suppliesProvided: true, paymentMethodId: declined,
    })
    log('declined', result)
    expect('error' in result && result.paymentFailed).toBe(true)
    const { data } = await db.from('bookings').select('id').eq('user_id', s.customerId).eq('scheduled_date', date)
    expect(data).toHaveLength(0)
  })

  it('3. customer cancels early: refund is what they paid minus the actual Stripe fee, only once', async () => {
    const { booking } = await book()
    const before = await charge(booking.stripe_payment_intent_id)
    const first = await refundBookingTotal(db, booking, 'minus_fee')
    const again = await refundBookingTotal(db, booking, 'minus_fee')
    const after = await charge(booking.stripe_payment_intent_id)
    log('cancel minus fee', { before, after, first, again })
    // Stripe can take a moment to record its fee, so it's read after the refund.
    expect(after.fee).not.toBeNull()
    expect(after.refunded).toBe(before.received - after.fee!)
    expect(again.refundId).toBe(first.refundId)
  })

  it('4. extra charge is paid, then admin "half" refund returns 50% of booking and extra charge', async () => {
    const { booking } = await book()
    await accept(booking.id)
    const req = await requestUpcharge(db, booking.id, { amount: 20, cleanerPay: 16, reason: 'Stripe test: extra mess' })
    expect(req).toEqual({ success: true })
    const pending = (await getPendingUpcharge(db, booking.id))!
    const pmId = (await db.from('payment_methods').select('stripe_payment_method_id').eq('id', visa).single()).data!.stripe_payment_method_id
    const expected = upchargeCustomerCharge(20, await stripePercentageForPaymentMethod(pmId))
    const paid = await payUpcharge(db, {
      customerId: s.customerId, upchargeId: (pending as { id: string }).id, paymentMethodId: visa,
      expectedCents: Math.round(expected * 100), attemptId: crypto.randomUUID(),
    })
    log('upcharge paid', paid)
    expect(paid).toMatchObject({ success: true })
    const { data: up } = await db.from('booking_upcharges').select('stripe_payment_intent_id, customer_charge').eq('booking_id', booking.id).single()
    const upCharge = await charge(up!.stripe_payment_intent_id!)
    expect(upCharge.received).toBe(Math.round(expected * 100))

    const res = await cancelBookingAsAdmin(db, booking.id, 'half')
    expect(res).toEqual({ success: true })
    const main = await charge(booking.stripe_payment_intent_id)
    const extra = await charge(up!.stripe_payment_intent_id!)
    log('admin half (single)', { main, extra })
    expect(main.refunded).toBe(Math.round(main.received * 0.5))
    expect(extra.refunded).toBe(Math.round(extra.received * 0.5))
  })

  it('5. admin "half" on a request sent to two Tidy Pros refunds 50% (regression)', async () => {
    const { booking } = await book()
    const pi = booking.stripe_payment_intent_id
    const { data: group } = await db
      .from('booking_request_groups')
      .insert({ user_id: s.customerId, stripe_payment_intent_id: pi, amount_cents: Math.round(Number(booking.total_customer_charge) * 100), primary_booking_id: booking.id })
      .select('id')
      .single()
    await db.from('bookings').update({ request_group_id: group!.id }).eq('id', booking.id)
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = booking
    await db.from('bookings').insert({ ...rest, tidy_pro_id: s.pro2Id, tidy_pro_name: 'Stripe Test Pro Two', request_group_id: group!.id } as never)

    const res = await cancelBookingAsAdmin(db, booking.id, 'half')
    expect(res).toEqual({ success: true })
    const c = await charge(pi)
    log('admin half (group)', c)
    expect(c.refunded).toBe(Math.round(c.received * 0.5))
    const { data: rows } = await db.from('bookings').select('status').eq('stripe_payment_intent_id', pi)
    expect(rows!.every((r) => r.status === 'cancelled')).toBe(true)
  })

  it('6. admin full and custom refunds', async () => {
    const a = await book()
    expect(await cancelBookingAsAdmin(db, a.booking.id, 'full')).toEqual({ success: true })
    const full = await charge(a.booking.stripe_payment_intent_id)
    const b = await book()
    expect(await cancelBookingAsAdmin(db, b.booking.id, 'custom', null, 5)).toEqual({ success: true })
    const custom = await charge(b.booking.stripe_payment_intent_id)
    log('admin full/custom', { full, custom })
    expect(full.refunded).toBe(full.received)
    expect(custom.refunded).toBe(500)
  })

  it('7. late cancel: 50% back to the customer, 80% of the rest (half their pay) to the Tidy Pro', async () => {
    const slot = localSlot(60)
    const { booking } = await book({ date: slot.date, time: slot.time })
    await accept(booking.id)
    expect(isLateCancellation(slot.date, slot.time, new Date(), TZ)).toBe(true)
    await refundBookingTotal(db, booking, 'late_cancel')
    const cleanerPay = lateCancelCleanerPay(Number(booking.cleaner_pay))
    await db.from('bookings').update({ status: 'cancelled', cancelled_reason: LATE_CANCEL_REASON, cleaner_pay: cleanerPay }).eq('id', booking.id)
    const payout = await completeBookingPayout(db, booking.id)
    expect(payout).toEqual({ success: true })
    const c = await charge(booking.stripe_payment_intent_id)
    const { data: after } = await db.from('bookings').select('stripe_transfer_id').eq('id', booking.id).single()
    const transfer = await stripe.transfers.retrieve(after!.stripe_transfer_id!)
    log('late cancel', { c, cleanerPay, transfer: { amount: transfer.amount, destination: transfer.destination } })
    expect(c.refunded).toBe(Math.round(c.received * 0.5))
    expect(transfer.amount).toBe(Math.round(cleanerPay * 100))
    expect(transfer.destination).toBe(s.proAccountId)
  })

  it('8. completed job pays the Tidy Pro their share from the customer charge', async () => {
    const { booking } = await book()
    await accept(booking.id)
    await db.from('bookings').update({ progress_status: 'done' }).eq('id', booking.id)
    expect(await completeBookingPayout(db, booking.id)).toEqual({ success: true })
    const { data: after } = await db.from('bookings').select('status, stripe_transfer_id').eq('id', booking.id).single()
    const transfer = await stripe.transfers.retrieve(after!.stripe_transfer_id!)
    const c = await charge(booking.stripe_payment_intent_id)
    log('payout', { status: after!.status, amount: transfer.amount, source: transfer.source_transaction, cleaner_pay: booking.cleaner_pay })
    expect(after!.status).toBe('completed')
    expect(transfer.amount).toBe(Math.round(Number(booking.cleaner_pay) * 100))
    expect(transfer.destination).toBe(s.proAccountId)
    expect(transfer.source_transaction).toBe(c.chargeId)
    // A second call must not pay twice.
    await completeBookingPayout(db, booking.id)
    const transfers = await stripe.transfers.list({ transfer_group: booking.id })
    expect(transfers.data).toHaveLength(1)
  })

  it('8b. admin holds a payout, then settles it with a refund; and takes back a sent payout in full', async () => {
    // Held before completion: nothing is sent, then a half refund pays half.
    const a = await book()
    await accept(a.booking.id)
    expect(await holdPayout(db, a.booking.id, 'Customer complaint')).toEqual({ success: true })
    await db.from('bookings').update({ progress_status: 'done' }).eq('id', a.booking.id)
    await completeBookingPayout(db, a.booking.id)
    const { data: held } = await db.from('bookings').select('status, stripe_transfer_id').eq('id', a.booking.id).single()
    expect(held!.status).toBe('completed')
    expect(held!.stripe_transfer_id).toBeNull()
    const pay = Number(a.booking.cleaner_pay)
    const settled = await refundCompletedBooking(db, a.booking.id, { refund: 'half', payout: 'half' })
    expect(settled).toMatchObject({ success: true, cleanerPay: Math.round((pay / 2) * 100) / 100 })
    expect(settled).not.toHaveProperty('warning')
    const heldTransfers = await stripe.transfers.list({ transfer_group: a.booking.id })
    expect(heldTransfers.data).toHaveLength(1)
    expect(heldTransfers.data[0].amount).toBe(Math.round((pay / 2) * 100))
    const ca = await charge(a.booking.stripe_payment_intent_id)
    expect(ca.refunded).toBe(Math.round(ca.received * 0.5))

    // Already paid, then found to be a no-show: full refund and the whole payout taken back.
    const b = await book()
    await accept(b.booking.id)
    await db.from('bookings').update({ progress_status: 'done' }).eq('id', b.booking.id)
    await completeBookingPayout(db, b.booking.id)
    expect(await holdPayout(db, b.booking.id, null)).toHaveProperty('error')
    const reversed = await refundCompletedBooking(db, b.booking.id, { refund: 'full', payout: 'none' })
    expect(reversed).toMatchObject({ success: true, cleanerPay: 0 })
    expect(reversed).not.toHaveProperty('warning')
    const { data: row } = await db.from('bookings').select('stripe_transfer_id, stripe_transfer_reversal_id').eq('id', b.booking.id).single()
    const transfer = await stripe.transfers.retrieve(row!.stripe_transfer_id!)
    log('payout hold and reversal', { settled, reversed, transfer: { amount: transfer.amount, reversed: transfer.amount_reversed } })
    expect(row!.stripe_transfer_reversal_id).toBeTruthy()
    expect(transfer.amount_reversed).toBe(transfer.amount)
    // Only once.
    expect(await refundCompletedBooking(db, b.booking.id, { refund: 'full', payout: 'none' })).toHaveProperty('error')
  })

  it('9. recurring visit: booked unpaid, then charged by the scheduled job', async () => {
    const { bookingId, total } = await book({ deferPayment: { dueAt: new Date() } })
    const { data: visit } = await db.from('bookings').select('status, amount_due, stripe_payment_intent_id').eq('id', bookingId).single()
    expect(visit!.status).toBe('scheduled')
    expect(visit!.stripe_payment_intent_id).toBeNull()
    const paid = await payForVisit(db, { bookingId, paymentMethodId: visa, attemptId: crypto.randomUUID() })
    expect(paid).toMatchObject({ success: true })
    const { data: after } = await db.from('bookings').select('stripe_payment_intent_id, amount_due, payment_due_at').eq('id', bookingId).single()
    const c = await charge(after!.stripe_payment_intent_id!)
    log('recurring', { total, paid, ...c })
    expect(c.status).toBe('succeeded')
    expect(after!.amount_due).toBeNull()
  })

  it('10. background-check fee checkout session is created in test mode', async () => {
    const session = await createFeeCheckoutSession(s.proId, 3500)
    log('bg fee', { mode: session.mode, amount: session.amount_total, livemode: session.livemode, url: session.url?.slice(0, 40) })
    expect(session.livemode).toBe(false)
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com/)
    await stripe.checkout.sessions.expire(session.id)
  })
})
