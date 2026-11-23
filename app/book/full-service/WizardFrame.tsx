'use client'

import Link from 'next/link'
import { FULL_SERVICE_LABEL, WIZARD_STEPS, type FullServiceType, type WizardStep } from '@/lib/fullService'

const STEP_LABEL: Record<WizardStep, string> = {
  scope: 'Rooms',
  priorities: 'Priorities',
  'add-ons': 'Add-ons',
  tasks: 'Tidy Tasks',
  notes: 'Notes',
}

// The page around each step of the Standard / Deep Cleaning wizard: which
// step this is, Back, the step's content, and the Continue button.
export default function WizardFrame({
  type,
  step,
  backHref,
  title,
  description,
  children,
  continueLabel = 'Continue',
  onContinue,
  continueDisabled = false,
  pending = false,
  error,
  secondaryAction,
}: {
  type: FullServiceType
  step: WizardStep
  backHref: string
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  continueLabel?: string
  onContinue: () => void
  continueDisabled?: boolean
  pending?: boolean
  error?: string | null
  secondaryAction?: React.ReactNode
}) {
  const index = WIZARD_STEPS.indexOf(step)
  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-40 max-w-sm mx-auto w-full safe-area-inset-bottom">
        <Link href={backHref} className="flex items-center gap-1.5 mb-5 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </Link>

        <p className="text-xs font-semibold text-brand mb-1">
          {FULL_SERVICE_LABEL[type]} · Step {index + 1} of {WIZARD_STEPS.length}: {STEP_LABEL[step]}
        </p>
        <div className="flex gap-1 mb-5" aria-hidden="true">
          {WIZARD_STEPS.map((s, i) => (
            <span key={s} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-brand' : 'bg-slate-100'}`} />
          ))}
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-1.5 leading-tight">{title}</h1>
        {description && <div className="text-sm text-slate-500 leading-relaxed mb-6">{description}</div>}

        {children}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 px-5 py-4 safe-area-inset-bottom">
        <div className="max-w-sm mx-auto">
          {error && (
            <p role="alert" className="text-sm text-red-600 mb-2">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onContinue}
            disabled={continueDisabled || pending}
            className="block w-full py-4 rounded-2xl bg-brand text-white font-semibold text-base text-center disabled:opacity-40"
          >
            {pending ? 'Saving…' : continueLabel}
          </button>
          {secondaryAction}
        </div>
      </div>
    </main>
  )
}

export function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (next: number) => void
}) {
  const btn =
    'w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-lg text-slate-700 disabled:opacity-30'
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`Fewer: ${label}`}>
        −
      </button>
      <span className="w-6 text-center text-sm font-semibold text-slate-900" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More: ${label}`}>
        +
      </button>
    </div>
  )
}
