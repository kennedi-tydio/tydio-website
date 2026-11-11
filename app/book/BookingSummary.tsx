import Link from 'next/link'
import type { TidyTask } from '@/app/dashboard/types'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import { isPetTask } from '@/lib/petTasks'
import { formatVisitDuration, laundryDetailLabel } from '@/lib/laundry'

type GroupedTask = { name: string; detail: string | null; count: number }

function groupTasks(tasks: TidyTask[]): GroupedTask[] {
  const grouped: GroupedTask[] = []
  // Pet tasks are listed with their own details below.
  for (const task of tasks.filter((t) => !isPetTask(t))) {
    const name = task.name || task.room
    // Laundry: service, baskets and machine loads.
    const detail = laundryDetailLabel(task)
    const last = grouped[grouped.length - 1]
    if (last && last.name === name && last.detail === detail) {
      last.count += 1
    } else {
      grouped.push({ name, detail, count: 1 })
    }
  }
  return grouped
}

export default function BookingSummary({
  tasks,
  firstName,
  photoUrls,
  durationMinutes,
}: {
  tasks: TidyTask[]
  firstName: string
  photoUrls: Record<string, string>
  // Estimated visit length (see visitDurationMinutes).
  durationMinutes: number
}) {
  const lines = groupTasks(tasks)

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-36 max-w-sm mx-auto w-full">
        <Link href="/dashboard" className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to {firstName}&apos;s Home
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Your Booking</h1>
        <p className="text-sm text-slate-400 mb-6">Review your tasks before choosing a Tidy Pro.</p>

        {lines.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden mb-6">
          {lines.map((item, i) => (
            <div key={i} className="px-4 py-3">
              <p className="text-sm font-medium text-slate-800 truncate">
                {item.name}
                {item.count > 1 ? ` × ${item.count}` : ''}
              </p>
              {item.detail && <p className="text-xs text-slate-400 mt-0.5">{item.detail}</p>}
            </div>
          ))}
        </div>
        )}

        <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 mb-6">
          <span className="text-sm text-slate-600">Estimated visit</span>
          <span className="text-sm font-semibold text-slate-900">{formatVisitDuration(durationMinutes)}</span>
        </div>

        <PetTaskDetails tasks={tasks} photoUrls={photoUrls} showPrepNotice className="mb-6" />
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-5 py-4 safe-area-inset-bottom">
        <div className="max-w-sm mx-auto">
          <Link
            href="/book/schedule"
            className="block w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide text-center"
            style={{ backgroundColor: '#1a2332' }}
          >
            Continue
          </Link>
        </div>
      </div>
    </main>
  )
}
