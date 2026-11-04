'use client'

function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill={filled ? '#f5a623' : 'none'} stroke={filled ? '#f5a623' : '#cbd5e1'} strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export default function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          aria-pressed={n === value}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <IconStar filled={n <= value} />
        </button>
      ))}
    </div>
  )
}
