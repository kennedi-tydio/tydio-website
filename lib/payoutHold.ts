// A Tidy Pro is paid as soon as a booking completes. The admin can put a booking's payout
// on hold first (payout_held_at), e.g. while looking into a customer's complaint: nothing
// is sent while it's held, and the Tidy Pro still sees it in Pending earnings
// (lib/earnings). The admin then releases it (Pay Tidy Pro, lib/adminPayout) or settles it
// with a refund that sets the payout (lib/bookingPayoutAdjustment), which can be nothing.
// A payout that has already gone out can't be held, only reversed by such a refund.

export function isPayoutHeld(b: { payout_held_at: string | null }): boolean {
  return b.payout_held_at != null
}

// What the admin can pay the Tidy Pro when refunding a booking: their whole pay, half,
// a custom amount up to their whole pay, or nothing.
export type AdminPayoutChoice = 'full' | 'half' | 'custom' | 'none'

export const ADMIN_PAYOUT_LABELS: Record<AdminPayoutChoice, string> = {
  full: 'Full payout',
  half: 'Half payout (50%)',
  custom: 'Custom amount',
  none: 'No payout',
}

export function isAdminPayoutChoice(value: unknown): value is AdminPayoutChoice {
  return typeof value === 'string' && Object.hasOwn(ADMIN_PAYOUT_LABELS, value)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// The Tidy Pro's new pay in dollars, or why the choice doesn't work. `currentPay` is what
// the booking pays them now, the most the admin can set.
export function adminCleanerPay(
  choice: AdminPayoutChoice,
  currentPay: number,
  customAmount: number | null = null
): { pay: number } | { error: string } {
  switch (choice) {
    case 'full':
      return { pay: round2(currentPay) }
    case 'half':
      return { pay: round2(currentPay / 2) }
    case 'none':
      return { pay: 0 }
    case 'custom': {
      if (customAmount == null || !Number.isFinite(customAmount) || customAmount < 0) return { error: 'Enter the Tidy Pro’s payout, $0 or more.' }
      if (Math.round(customAmount * 100) > Math.round(currentPay * 100)) {
        return { error: `The payout can’t be more than the Tidy Pro’s $${currentPay.toFixed(2)} for this booking.` }
      }
      return { pay: round2(customAmount) }
    }
  }
}
