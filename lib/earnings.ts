// A Tidy Pro's earnings are added up from their completed bookings rather than
// read from the *_earnings columns on tidypro_profiles, which nothing keeps up
// to date. Tips count in full, since the cleaner receives 100% of them.

export type EarningsBooking = {
  cleaner_pay: number | null
  tip: number | null
  stripe_transfer_id: string | null
}

type BalanceAmount = { amount: number; currency: string }

// `overall` is everything ever earned. `heldByTydio` is the part not yet sent to the
// Tidy Pro's Stripe account: booking pay still waiting on its transfer, or everything
// if they have no account to send it to. Tips otherwise transfer as they're charged.
export function summarizeEarnings(
  bookings: EarningsBooking[],
  hasPayoutAccount: boolean
): { overall: number; heldByTydio: number } {
  let overall = 0
  let heldByTydio = 0
  for (const b of bookings) {
    const pay = b.cleaner_pay ?? 0
    const tip = b.tip ?? 0
    overall += pay + tip
    if (!hasPayoutAccount) heldByTydio += pay + tip
    else if (!b.stripe_transfer_id) heldByTydio += pay
  }
  return { overall, heldByTydio }
}

// Money in a Tidy Pro's Stripe account hasn't reached their bank until Stripe pays
// it out, whether it's still settling (`pending`) or ready to go (`available`). Stripe
// reports cents, and a refund can push a balance negative, which isn't money owed to them.
export function unpaidStripeBalance(balance: { available: BalanceAmount[]; pending: BalanceAmount[] }): number {
  const cents = [...balance.available, ...balance.pending]
    .filter((b) => b.currency === 'usd')
    .reduce((sum, b) => sum + b.amount, 0)
  return Math.max(cents, 0) / 100
}
