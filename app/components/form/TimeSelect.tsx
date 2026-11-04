'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

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

type ParsedQuery = { hour: number; minute: number | null; meridiem: 'a' | 'p' | null }

// Turns loose typed input ("2", "230", "2:30", "2pm", "230p") into a
// structured hour/minute/meridiem guess so it can be matched against the
// option list — there's no separator required, so a 3-4 digit run is read
// as hour + the last two digits as minutes (like a digital clock input).
function parseQuery(raw: string): ParsedQuery | null {
  const q = raw.trim().toLowerCase()
  if (!q) return null

  const meridiemMatch = q.match(/(am|pm|a|p)$/)
  const meridiem = meridiemMatch ? (meridiemMatch[1][0] as 'a' | 'p') : null
  const digits = q.slice(0, meridiemMatch ? -meridiemMatch[1].length : undefined).replace(/[^\d:]/g, '')
  if (!digits) return meridiem ? { hour: -1, minute: null, meridiem } : null

  if (digits.includes(':')) {
    const [h, m] = digits.split(':')
    const hour = Number(h)
    if (!Number.isFinite(hour)) return null
    const minute = m ? Number(m) : null
    return { hour, minute, meridiem }
  }

  if (digits.length <= 2) return { hour: Number(digits), minute: null, meridiem }

  return { hour: Number(digits.slice(0, -2)), minute: Number(digits.slice(-2)), meridiem }
}

function matchesQuery(optionHHMM: string, parsed: ParsedQuery | null): boolean {
  if (!parsed) return true
  const [oh, om] = optionHHMM.split(':').map(Number)
  const oh12 = oh % 12 === 0 ? 12 : oh % 12

  if (parsed.hour !== -1) {
    if (parsed.hour < 1 || parsed.hour > 12) return false
    if (parsed.hour !== oh12) return false
  }
  if (parsed.minute != null) {
    const omStr = String(om).padStart(2, '0')
    if (!omStr.startsWith(String(parsed.minute))) return false
  }
  if (parsed.meridiem) {
    const oMeridiem = oh >= 12 ? 'p' : 'a'
    if (parsed.meridiem !== oMeridiem) return false
  }
  return true
}

type Props = {
  value: string
  onChange: (value: string) => void
  className?: string
  ariaLabel?: string
}

export default function TimeSelect({ value, onChange, className, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsedQuery = useMemo(() => parseQuery(query), [query])
  const filteredOptions = useMemo(
    () => TIME_OPTIONS.filter((t) => matchesQuery(t, parsedQuery)),
    [parsedQuery]
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open && listRef.current) {
      const target = listRef.current.querySelector('[data-selected="true"]') ?? listRef.current.querySelector('[role="option"]')
      target?.scrollIntoView({ block: 'center' })
    }
  }, [open, query])

  function commit(t: string) {
    onChange(t)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredOptions.length > 0) commit(filteredOptions[0])
    } else if (e.key === 'Escape') {
      // Keeps an enclosing ModalShell from closing too.
      if (open) e.preventDefault()
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-expanded={open}
        role="combobox"
        aria-autocomplete="list"
        value={open ? query : formatLabel(value)}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={formatLabel(value)}
        className="w-full px-3 py-2.5 text-sm text-slate-800 rounded-xl border border-slate-200 text-left focus:outline-none focus:border-brand"
      />
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-10 mt-1 w-full min-w-[7.5rem] max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">No matching times</p>
          ) : (
            filteredOptions.map((t) => {
              const selected = t === value
              return (
                <button
                  key={t}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-selected={selected}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(t)}
                  className={`w-full text-left px-3 py-2 text-sm ${selected ? 'text-white font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}
                  style={selected ? { backgroundColor: 'var(--color-brand)' } : undefined}
                >
                  {formatLabel(t)}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
