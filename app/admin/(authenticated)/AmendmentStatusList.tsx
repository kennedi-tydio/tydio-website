import type { AmendmentStatus } from '@/lib/legal/agreementAmendments'

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

// One line per contractor-agreement amendment naming this Tidy Pro: amber while it's
// waiting for their signature, a link to their signed copy once it isn't.
export default function AmendmentStatusList({ statuses, className = 'text-xs' }: { statuses: AmendmentStatus[] | undefined; className?: string }) {
  if (!statuses?.length) return null
  return (
    <ul className={`${className} space-y-0.5`}>
      {statuses.map((s) => (
        <li key={s.number} className="whitespace-nowrap">
          {s.signatureId && s.signedAt ? (
            <a href={`/admin/agreements/${s.signatureId}`} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">
              Amendment No. {s.number} signed {shortDate(s.signedAt)}
            </a>
          ) : (
            <span className="font-semibold text-amber-700">Amendment No. {s.number} not signed</span>
          )}
        </li>
      ))}
    </ul>
  )
}
