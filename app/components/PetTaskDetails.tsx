import type { TidyTask } from '@/app/dashboard/types'
import { PET_TASK_PREP_NOTICE, formatEstimatedMinutes, isPetTask, petDetailLabel, type PetTaskKind } from '@/lib/petTasks'

type Props = {
  tasks: TidyTask[]
  // Signed URLs by storage path (lib/customerTaskPhotos.ts). A photo without
  // one isn't shown.
  photoUrls: Record<string, string>
  // Customer side: remind them to get supplies ready and secure their pets.
  showPrepNotice?: boolean
  className?: string
}

// The scope, instructions, estimate and checked photos saved with each pet
// enclosure / litter box task. Renders nothing when there are none.
export default function PetTaskDetails({ tasks, photoUrls, showPrepNotice = false, className = '' }: Props) {
  const petTasks = tasks.filter(isPetTask)
  if (petTasks.length === 0) return null
  const kinds = Array.from(new Set(petTasks.map((t) => t.pet.kind))) as PetTaskKind[]

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {petTasks.map((task) => {
        const photos = task.pet.photos.filter((p) => photoUrls[p])
        const estimate = formatEstimatedMinutes(task.estimatedMinutes)
        return (
          <div key={task.id} className="rounded-2xl border border-slate-100 bg-white shadow-sm p-4">
            <p className="text-sm font-semibold text-slate-900">{task.name || task.room}</p>
            <p className="text-xs text-slate-500 mb-2">{[petDetailLabel(task), estimate].filter(Boolean).join(' · ')}</p>
            <p className="text-xs font-semibold text-slate-700">What&apos;s included</p>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">{task.pet.scope}</p>
            {task.notes && (
              <>
                <p className="text-xs font-semibold text-slate-700">Cleaning instructions</p>
                <p className="text-xs text-slate-600 leading-relaxed mb-2 whitespace-pre-line">{task.notes}</p>
              </>
            )}
            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pt-1 -mx-1 px-1">
                {photos.map((path, i) => (
                  <a
                    key={path}
                    href={photoUrls[path]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0"
                    aria-label={`Open photo ${i + 1} of ${task.name || 'this task'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrls[path]} alt="" className="w-20 h-20 rounded-xl object-cover bg-slate-100" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {showPrepNotice && (
        <div className="rounded-xl bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold text-slate-700 mb-0.5">Before your Tidy Pro arrives</p>
          {kinds.map((k) => (
            <p key={k} className="text-xs text-slate-500 leading-relaxed">
              {PET_TASK_PREP_NOTICE[k]}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
