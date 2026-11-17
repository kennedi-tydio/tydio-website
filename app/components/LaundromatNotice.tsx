import type { TidyTask } from '@/app/dashboard/types'
import { LAUNDROMAT_CUSTOMER_NOTE, LAUNDROMAT_STAY_NOTE, LAUNDRY_SERVICE_LABEL, laundryQuantityLabel, usesLaundromat } from '@/lib/laundry'

// Highlighted when the customer has no working washer and dryer, so the laundry
// goes to a laundromat. For the Tidy Pro ('tidyPro'): on the booking request, so
// they know before accepting, and throughout the active booking, with the rule that
// they stay there for the whole cycle. For the customer ('customer'): when they
// review the booking, so they know how the trip works and is charged. Renders
// nothing otherwise.
export default function LaundromatNotice({
  tasks,
  audience = 'tidyPro',
  className = '',
}: {
  tasks: TidyTask[]
  audience?: 'tidyPro' | 'customer'
  className?: string
}) {
  const laundromatTasks = tasks.filter(usesLaundromat)
  if (laundromatTasks.length === 0) return null

  return (
    <div role="note" aria-label="Laundromat trip" className={`rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 ${className}`}>
      <div className="flex items-start gap-2.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0 mt-px">
          <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-900">Laundromat trip</p>
          {audience === 'tidyPro' ? (
            <>
              <p className="text-sm text-amber-900 leading-relaxed mt-0.5">
                This customer doesn&apos;t have a working washer and dryer. You&apos;ll take their laundry to the nearest laundromat.
              </p>
              <p className="text-sm font-semibold text-amber-900 leading-relaxed mt-1.5">{LAUNDROMAT_STAY_NOTE}</p>
            </>
          ) : (
            <p className="text-sm text-amber-900 leading-relaxed mt-0.5">{LAUNDROMAT_CUSTOMER_NOTE}</p>
          )}
          <ul className="mt-1.5 text-xs text-amber-800 list-disc pl-4">
            {laundromatTasks.map((task) => (
              <li key={task.id}>
                {task.name || task.room} ({[LAUNDRY_SERVICE_LABEL[task.laundryService!], laundryQuantityLabel(task)].filter(Boolean).join(' · ')})
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
