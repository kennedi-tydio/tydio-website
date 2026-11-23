'use client'

import { useState } from 'react'
import ModalShell from '@/app/components/ModalShell'
import { addOn as addOnFor, type AddOnKey } from '@/lib/fullService'
import { alreadyIncludedMessage, sameRoomQuestion, type OverlapDecision } from '@/lib/fullServiceScope'

// The pop-up for a Tidy Task that may already be part of the customer's
// Standard / Deep Cleaning (lib/fullServiceScope decideOverlap). Nothing is
// ever removed from their task lists: "Same room" just doesn't add this one,
// and they can pick the task again later for another room.
export default function OverlapPrompt({
  decision,
  onAdd,
  onAddAddOn,
  onClose,
}: {
  decision: Exclude<OverlapDecision, { kind: 'none' }>
  // Add the task. `differentRoom` when they said it's for another room.
  onAdd: (differentRoom: boolean) => void
  // Add the matching add-on to the cleaning instead of a Tidy Task.
  onAddAddOn?: (key: AddOnKey) => void
  onClose: () => void
}) {
  const [included, setIncluded] = useState<string | null>(null)
  const panel = 'w-full max-w-sm bg-white rounded-3xl px-6 pt-6 pb-6 shadow-2xl'
  const primary = 'w-full py-3 rounded-xl text-sm font-semibold text-white bg-brand'
  const secondary = 'w-full py-3 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200'

  if (included) {
    return (
      <ModalShell className="fixed inset-0 z-[60] flex items-center justify-center px-4" panelClassName={panel} onClose={onClose} labelledBy="overlap-title">
        <h2 id="overlap-title" className="text-lg font-bold text-slate-900 mb-2">
          Already included
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-5">{included}</p>
        <button type="button" onClick={onClose} className={primary}>
          Got it
        </button>
      </ModalShell>
    )
  }

  if (decision.kind === 'ask_same_room') {
    const noun = decision.roomNoun
    return (
      <ModalShell className="fixed inset-0 z-[60] flex items-center justify-center px-4" panelClassName={panel} onClose={onClose} labelledBy="overlap-title">
        <h2 id="overlap-title" className="text-lg font-bold text-slate-900 mb-4 leading-snug">
          {sameRoomQuestion(decision)}
        </h2>
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={() => setIncluded(alreadyIncludedMessage(decision.serviceLabel))} className={secondary}>
            Same {noun}
          </button>
          <button type="button" onClick={() => onAdd(true)} className={primary}>
            Different {noun}
          </button>
        </div>
      </ModalShell>
    )
  }

  if (decision.kind === 'included_entire_home') {
    return (
      <ModalShell className="fixed inset-0 z-[60] flex items-center justify-center px-4" panelClassName={panel} onClose={onClose} labelledBy="overlap-title">
        <h2 id="overlap-title" className="text-lg font-bold text-slate-900 mb-2">
          Already included
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          Your {decision.serviceLabel} covers your entire home, so this task is likely already included. You don&apos;t need to
          add it separately.
        </p>
        <div className="flex flex-col gap-2.5">
          <button type="button" onClick={onClose} className={primary}>
            Got it
          </button>
          {decision.allowAddAnyway && (
            <button type="button" onClick={() => onAdd(false)} className={secondary}>
              This is extra work. Add it anyway
            </button>
          )}
        </div>
      </ModalShell>
    )
  }

  const a = addOnFor(decision.addOn)
  return (
    <ModalShell className="fixed inset-0 z-[60] flex items-center justify-center px-4" panelClassName={panel} onClose={onClose} labelledBy="overlap-title">
      <h2 id="overlap-title" className="text-lg font-bold text-slate-900 mb-2">
        Add this as an add-on?
      </h2>
      <p className="text-sm text-slate-600 leading-relaxed mb-5">
        {a.label} is an add-on for your cleaning. Add-ons are priced differently by each Tidy Pro.
      </p>
      <div className="flex flex-col gap-2.5">
        {onAddAddOn && (
          <button type="button" onClick={() => onAddAddOn(a.key)} className={primary}>
            Add as an add-on
          </button>
        )}
        <button type="button" onClick={() => onAdd(false)} className={secondary}>
          Add as a Tidy Task instead
        </button>
      </div>
    </ModalShell>
  )
}
