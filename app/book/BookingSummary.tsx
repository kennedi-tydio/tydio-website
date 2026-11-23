import Link from 'next/link'
import type { TidyTask } from '@/app/dashboard/types'
import PetTaskDetails from '@/app/components/PetTaskDetails'
import { isPetTask } from '@/lib/petTasks'
import { laundryDetailLabel } from '@/lib/laundry'
import FullServiceSummary from '@/app/components/FullServiceSummary'
import { FULL_SERVICE_LABEL, type FullServiceSelection } from '@/lib/fullService'
import { RoomIcon } from '@/app/components/RoomIcon'

type GroupedTask = { name: string; detail: string | null; count: number }
type RoomGroup = { room: string; tasks: GroupedTask[] }

// Tasks grouped by the room they'll be done in, in the order each room was
// first added. Identical tasks in the same room collapse into "× n".
function groupTasks(tasks: TidyTask[]): RoomGroup[] {
  const rooms: RoomGroup[] = []
  // Pet tasks are listed with their own details below.
  for (const task of tasks.filter((t) => !isPetTask(t))) {
    const roomName = task.room || 'Other'
    let group = rooms.find((r) => r.room === roomName)
    if (!group) {
      group = { room: roomName, tasks: [] }
      rooms.push(group)
    }
    const name = task.name || task.room
    // Laundry: service, baskets and machine loads.
    const detail = laundryDetailLabel(task)
    const same = group.tasks.find((t) => t.name === name && t.detail === detail)
    if (same) {
      same.count += 1
    } else {
      group.tasks.push({ name, detail, count: 1 })
    }
  }
  return rooms
}

export default function BookingSummary({
  tasks,
  fullService,
  firstName,
  photoUrls,
  canBook,
  allTasksIncluded,
}: {
  tasks: TidyTask[]
  fullService: FullServiceSelection | null
  firstName: string
  photoUrls: Record<string, string>
  // False while waitlisted / paused: they can't go on to find Tidy Pros yet.
  canBook: boolean
  // Every saved Tidy Task is already covered by the Standard / Deep Cleaning.
  allTasksIncluded: boolean
}) {
  const lines = groupTasks(tasks)

  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-36 max-w-sm mx-auto w-full safe-area-inset-bottom">
        <Link href={fullService ? '/book/full-service/notes' : '/dashboard'} className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {fullService ? 'Back' : <>Back to {firstName}&apos;s Home</>}
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-1">Your Booking</h1>
        <p className="text-sm text-slate-400 mb-6">Review your tasks before choosing a Tidy Pro.</p>

        {fullService && (
          <>
            <FullServiceSummary selection={fullService} editHref="/book/full-service/scope" className="mb-2" />
            <p className="text-xs text-slate-500 mb-6">
              Each Tidy Pro sets their own price for this cleaning. You&apos;ll see each one&apos;s total on the next step.
            </p>
          </>
        )}

        {fullService && (lines.length > 0 || allTasksIncluded) && (
          <h2 className="text-sm font-bold text-slate-900 mb-2">Tidy Tasks</h2>
        )}

        {fullService && allTasksIncluded && (
          <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600 mb-6">
            No Tidy Tasks to add. Your saved tasks are already included in your {FULL_SERVICE_LABEL[fullService.type]}.
          </p>
        )}

        {lines.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden mb-6">
          {lines.map((group) => (
            <div key={group.room} className="px-4 py-3">
              <div className="flex items-center gap-2.5 mb-1.5">
                <RoomIcon room={group.room} />
                <h3 className="text-sm font-semibold text-slate-900 truncate">{group.room}</h3>
              </div>
              <ul className="flex flex-col gap-1.5 pl-7">
                {group.tasks.map((item, i) => (
                  <li key={i}>
                    <p className="text-sm text-slate-700 truncate">
                      {item.name}
                      {item.count > 1 ? ` × ${item.count}` : ''}
                    </p>
                    {item.detail && <p className="text-xs text-slate-400 mt-0.5">{item.detail}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        )}

        <PetTaskDetails tasks={tasks} photoUrls={photoUrls} showPrepNotice className="mb-6" />
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-5 py-4 safe-area-inset-bottom">
        <div className="max-w-sm mx-auto">
          {canBook ? (
            <Link
              href="/book/schedule"
              className="block w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide text-center"
              style={{ backgroundColor: '#1a2332' }}
            >
              Continue
            </Link>
          ) : (
            <>
              <p className="text-sm text-slate-600 text-center leading-relaxed mb-3">
                You&apos;re on the Tydio waitlist, so you can&apos;t find a Tidy Pro yet. Your booking is saved on your
                Home page, and we&apos;ll let you know when booking opens in your area.
              </p>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="block w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide text-center opacity-50 cursor-not-allowed"
                style={{ backgroundColor: 'var(--color-slate-400)' }}
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
