'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { US_STATES, findUsState } from '@/lib/usStates'

type Props = {
  value: string
  onChange: (stateCode: string) => void
  placeholder?: string
  className?: string
}

export default function StateSelect({ value, onChange, placeholder = 'State', className }: Props) {
  const selected = findUsState(value)
  // What they're typing to search, or null when the box should just show the
  // chosen state. Reading the name straight from `value` means a state filled
  // in from elsewhere (picking a Google address suggestion) always shows up.
  const [draft, setDraft] = useState<string | null>(null)
  const query = draft ?? selected?.name ?? ''
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setDraft(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const results = useMemo(() => {
    const q = (draft ?? '').trim().toLowerCase()
    if (!q) return US_STATES
    return US_STATES.filter(
      (s) => s.name.toLowerCase().startsWith(q) || s.code.toLowerCase() === q
    )
  }, [draft])

  function selectState(code: string) {
    onChange(code)
    setDraft(null)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const match = results[highlight]
      if (match) selectState(match.code)
    } else if (e.key === 'Escape') {
      // Keeps an enclosing ModalShell from closing too.
      if (open) e.preventDefault()
      setOpen(false)
      setDraft(null)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <input
        aria-label="State"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="state-select-listbox"
        aria-autocomplete="list"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setDraft(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
      />
      {open && (
        <div
          id="state-select-listbox"
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No matches</p>
          ) : (
            results.map((s, i) => (
              <button
                key={s.code}
                type="button"
                role="option"
                aria-selected={s.code === selected?.code}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectState(s.code)
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-4 py-2.5 text-sm ${
                  i === highlight ? 'bg-slate-100 text-slate-900' : 'text-slate-700'
                } ${s.code === selected?.code ? 'font-semibold' : ''}`}
              >
                {s.name} <span className="text-slate-400">({s.code})</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
