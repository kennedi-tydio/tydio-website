import { formatFeeCents } from '@/lib/backgroundCheckFee'

// The cleaner agreement's fee and refund terms, shown on both the agreement and
// payment screens so the wording can't drift apart. Only shown while a fee is
// switched on. Deliberately contains no screening disclosure or authorization
// language: those stay on Checkr's standalone form, kept apart from these terms.
export default function BackgroundCheckFeeTerms({ feeCents }: { feeCents: number }) {
  return (
    <ul className="text-xs text-slate-600 leading-relaxed list-disc space-y-1.5 rounded-xl bg-slate-50 border border-slate-100 pl-7 pr-4 py-3">
      <li>
        The background-screening fee is <strong>{formatFeeCents(feeCents)}</strong>, paid before screening begins.
      </li>
      <li>The fee pays for screening. It does not guarantee approval, bookings, or earnings.</li>
      <li>
        The fee is <strong>non-refundable</strong>, except for duplicate charges, Tydio ordering errors, and cases where Tydio cancels onboarding for
        its own business reasons unrelated to screening results or cleaner conduct.
      </li>
      <li>Any additional charge requires your agreement in advance.</li>
    </ul>
  )
}
