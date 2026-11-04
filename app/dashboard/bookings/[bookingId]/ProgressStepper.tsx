'use client'

const STEPS = [
  { key: 'on_the_way', label: 'On the way' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'done', label: 'Done' },
] as const

export type ProgressStep = (typeof STEPS)[number]['key']

export default function ProgressStepper({ current }: { current: ProgressStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current)

  return (
    <div className="flex gap-2" role="list" aria-label="Booking progress">
      {STEPS.map((step, i) => {
        const reached = i <= currentIndex
        return (
          <div
            key={step.key}
            role="listitem"
            aria-current={i === currentIndex ? 'step' : undefined}
            className="flex-1 flex flex-col items-center gap-2"
          >
            <span className="w-full h-1 rounded-full" style={{ backgroundColor: reached ? 'var(--color-brand)' : '#e2e8f0' }} />
            <span className="text-xs font-medium whitespace-nowrap" style={{ color: reached ? 'var(--color-brand)' : '#cbd5e1' }}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
