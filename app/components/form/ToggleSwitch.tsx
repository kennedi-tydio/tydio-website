'use client'

// Pass `labelledBy` (the id of the visible row title) when there is one,
// otherwise `label`, so screen readers announce what the switch controls.
export default function ToggleSwitch({
  on,
  onClick,
  disabled,
  label,
  labelledBy,
  describedBy,
}: {
  on: boolean
  onClick: () => void
  disabled?: boolean
  label?: string
  labelledBy?: string
  describedBy?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={onClick}
      disabled={disabled}
      className="w-11 h-6 rounded-full flex-shrink-0 relative transition-colors disabled:opacity-50"
      style={{ backgroundColor: on ? 'var(--color-brand)' : '#64748b' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  )
}
