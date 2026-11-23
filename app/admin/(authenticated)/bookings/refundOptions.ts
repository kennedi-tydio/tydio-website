import { ADMIN_REFUND_LABELS } from '@/lib/bookingRequestGroups'
import { halfRefund } from '@/lib/pricingRules'
import type { RefundOption } from './CancelBookingButton'

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

// The refunds an admin can choose when canceling a booking. Nothing charged, nothing to refund.
export function refundOptions(b: { stripe_payment_intent_id: string | null; total_customer_charge: number | null }): RefundOption[] {
  if (!b.stripe_payment_intent_id) return []
  const total = b.total_customer_charge ?? 0
  return [
    { value: 'full', label: `${ADMIN_REFUND_LABELS.full} (${money(total)})` },
    { value: 'minus_fee', label: ADMIN_REFUND_LABELS.minus_fee },
    { value: 'half', label: `${ADMIN_REFUND_LABELS.half} (${money(halfRefund(total))})` },
    { value: 'custom', label: `${ADMIN_REFUND_LABELS.custom}…`, max: total },
    { value: 'none', label: ADMIN_REFUND_LABELS.none },
  ]
}
