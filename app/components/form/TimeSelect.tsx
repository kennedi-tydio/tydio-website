'use client'

import { useEffect, useRef, useState } from 'react'

const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
})

function formatLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

type Props = {
  value: string
  onChange: (value: string) => void
  className?: string
  ariaLabel?: string
}

export default function TimeSelect({ value, onChange, className, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' })
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2.5 text-sm text-slate-800 rounded-xl border border-slate-200 text-left focus:outline-none focus:border-[#38C7CA]"
      >
        {formatLabel(value)}
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-10 mt-1 w-full min-w-[7.5rem] max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {TIME_OPTIONS.map((t) => {
            const selected = t === value
            return (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={selected}
                data-selected={selected}
                onClick={() => {
                  onChange(t)
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-sm ${selected ? 'text-white font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
                style={selected ? { backgroundColor: '#38C7CA' } : undefined}
              >
                {formatLabel(t)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
