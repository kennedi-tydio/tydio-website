'use client'

import { useState, useTransition } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { addOnsFor, type AddOnKey, type FullServiceSelection } from '@/lib/fullService'
import WizardFrame, { Stepper } from '../WizardFrame'
import { saveFullServiceStepAction } from '../actions'

// Each Tidy Pro sets their own add-on prices, so none are shown here; the
// customer sees each Tidy Pro's exact total when they choose one.
export default function AddOnsStep({ selection }: { selection: FullServiceSelection }) {
  const router = useRouter()
  const available = addOnsFor(selection.type)
  const [quantities, setQuantities] = useState<Partial<Record<AddOnKey, number>>>(selection.addOns)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const any = available.some((a) => (quantities[a.key] ?? 0) > 0)

  function handleContinue() {
    setError(null)
    startTransition(async () => {
      const result = await saveFullServiceStepAction({ addOns: quantities }, 'tasks')
      if (result.error) setError(result.error)
      else router.push('/book/full-service/tasks')
    })
  }

  return (
    <WizardFrame
      type={selection.type}
      step="add-ons"
      backHref="/book/full-service/priorities"
      title="Add anything extra?"
      description="Add-ons are priced differently by each Tidy Pro. You'll see the exact price before you book."
      onContinue={handleContinue}
      continueLabel={any ? 'Continue' : 'Skip'}
      pending={pending}
      error={error}
    >
      <div className="flex flex-col divide-y divide-slate-100 border border-slate-100 rounded-2xl mb-4">
        {available.map((a) => (
          <div key={a.key} className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="min-w-0 text-sm text-slate-800">{a.label}</p>
            <Stepper
              label={a.label}
              value={quantities[a.key] ?? 0}
              max={a.maxQty}
              onChange={(n) => setQuantities((prev) => ({ ...prev, [a.key]: n }))}
            />
          </div>
        ))}
      </div>
    </WizardFrame>
  )
}
