'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { PRIORITIES, PRIORITIES_COPY, type FullServiceSelection, type PriorityKey } from '@/lib/fullService'
import WizardFrame from '../WizardFrame'
import { saveFullServiceStepAction } from '../actions'

export default function PrioritiesStep({ selection }: { selection: FullServiceSelection }) {
  const router = useRouter()
  const [chosen, setChosen] = useState<Set<PriorityKey>>(() => new Set(selection.priorities))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(key: PriorityKey) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleContinue() {
    setError(null)
    startTransition(async () => {
      const result = await saveFullServiceStepAction({ priorities: Array.from(chosen) }, 'add-ons')
      if (result.error) setError(result.error)
      else router.push('/book/full-service/add-ons')
    })
  }

  return (
    <WizardFrame
      type={selection.type}
      step="priorities"
      backHref="/book/full-service/scope"
      title={PRIORITIES_COPY.title}
      description={PRIORITIES_COPY.body}
      onContinue={handleContinue}
      continueLabel={chosen.size === 0 ? 'Skip' : 'Continue'}
      pending={pending}
      error={error}
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-3 py-1 mb-4">
        No extra charge
      </p>
      <fieldset className="flex flex-col gap-2.5 mb-5">
        <legend className="sr-only">Cleaning priorities</legend>
        {PRIORITIES.map((p) => {
          const checked = chosen.has(p.key)
          return (
            <label
              key={p.key}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 cursor-pointer ${
                checked ? 'border-brand bg-[#f0fafa]' : 'border-slate-100'
              }`}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(p.key)} className="mt-0.5 w-4 h-4 accent-[var(--color-brand)]" />
              <span className="text-sm text-slate-800">{p.label}</span>
            </label>
          )
        })}
      </fieldset>
      <p className="text-xs text-slate-500 leading-relaxed">
        Priorities tell your Tidy Pro where to focus within your cleaning. They don&apos;t add work: extra tasks can be added
        as add-ons or Tidy Tasks in the next steps.
      </p>
    </WizardFrame>
  )
}
