'use client'

import { ADMIN_PAYOUT_LABELS, type AdminPayoutChoice } from '@/lib/payoutHold'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

// What the chosen payout pays, in dollars, or null for a custom amount not typed yet.
export function payoutAmount(choice: AdminPayoutChoice, pay: number, custom: string): number | null {
  if (choice === 'full') return pay
  if (choice === 'half') return Math.round((pay / 2) * 100) / 100
  if (choice === 'none') return 0
  return custom.trim() === '' || !Number.isFinite(Number(custom)) ? null : Number(custom)
}

// The Tidy Pro's payout when the admin refunds a booking: their whole pay, half, a custom
// amount up to it, or nothing. Sent as `payout` and, for a custom amount, `payout_amount`.
export default function PayoutFields({
  pay,
  choice,
  onChoice,
  custom,
  onCustom,
}: {
  // What the booking pays the Tidy Pro now.
  pay: number
  choice: AdminPayoutChoice
  onChoice: (choice: AdminPayoutChoice) => void
  custom: string
  onCustom: (value: string) => void
}) {
  const labels: Record<AdminPayoutChoice, string> = {
    full: `${ADMIN_PAYOUT_LABELS.full} (${money(pay)})`,
    half: `${ADMIN_PAYOUT_LABELS.half} (${money(Math.round((pay / 2) * 100) / 100)})`,
    custom: `${ADMIN_PAYOUT_LABELS.custom}…`,
    none: ADMIN_PAYOUT_LABELS.none,
  }
  return (
    <div className="flex flex-col items-end gap-1 w-64">
      <label className="flex items-center gap-1 w-full text-xs text-slate-600">
        <span className="whitespace-nowrap">Tidy Pro payout</span>
        <select
          name="payout"
          value={choice}
          onChange={(e) => onChoice(e.currentTarget.value as AdminPayoutChoice)}
          className="flex-1 min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
        >
          {(['none', 'half', 'full', 'custom'] as const).map((c) => (
            <option key={c} value={c}>
              {labels[c]}
            </option>
          ))}
        </select>
      </label>
      {choice === 'custom' && (
        <label className="flex items-center gap-1 w-full text-xs text-slate-600">
          <span>Pay $</span>
          <input
            name="payout_amount"
            type="number"
            inputMode="decimal"
            required
            min="0"
            step="0.01"
            max={pay}
            value={custom}
            onChange={(e) => onCustom(e.currentTarget.value)}
            aria-label="Tidy Pro payout in dollars"
            className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700"
          />
        </label>
      )}
      {choice === 'custom' && <span className="text-[11px] text-slate-400">Up to {money(pay)}, their pay for this booking</span>}
    </div>
  )
}
