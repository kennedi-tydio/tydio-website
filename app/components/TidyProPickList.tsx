'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CleanerMatch } from '@/lib/cleanerMatching'
import { VerifiedCheck } from '@/app/components/VerifiedCheck'

// Picks survive a trip to a Tidy Pro's profile and back (and from the picker to the
// review page) in sessionStorage. Per tab and best effort: if storage is blocked,
// the customer just picks again.
export function picksStorageKey(scope: string): string {
  return `tydio:tidy-pro-picks:${scope}`
}

export function readPicks(scope: string): string[] {
  try {
    const raw = sessionStorage.getItem(picksStorageKey(scope))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function writePicks(scope: string, ids: string[]): void {
  try {
    sessionStorage.setItem(picksStorageKey(scope), JSON.stringify(ids))
  } catch {
    // storage unavailable: the picks just won't be remembered
  }
}

// The saved picks for `scope`, kept to Tidy Pros still on offer and to `max`.
export function usePersistedPicks(scope: string, availableIds: string[], max: number) {
  const [picks, setPicks] = useState<string[]>([])
  const availableKey = availableIds.join(',')

  useEffect(() => {
    const available = new Set(availableKey ? availableKey.split(',') : [])
    // Restoring from storage can only happen after mount; the server render has no picks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicks(readPicks(scope).filter((id) => available.has(id)).slice(0, max))
  }, [scope, availableKey, max])

  function toggle(id: string) {
    setPicks((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < max ? [...prev, id] : prev
      writePicks(scope, next)
      return next
    })
  }

  function clear() {
    writePicks(scope, [])
    setPicks([])
  }

  return { picks, toggle, clear }
}

function IconStar() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#f5a623" stroke="#f5a623" strokeWidth="1" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconPin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <span
      className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors"
      style={checked ? { borderColor: 'var(--color-brand)', backgroundColor: 'var(--color-brand)' } : { borderColor: 'var(--color-slate-300)', backgroundColor: 'white' }}
    >
      {checked && (
        <svg width="13" height="13" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <path d="M2 5.5l2.5 2.5 4.5-5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

// Tidy Pros to check off, laid out like the search results. Tapping a card opens
// the profile to look over first; the check mark on the right picks them.
export default function TidyProPickList({
  options,
  picks,
  onToggle,
  max,
  disabled = false,
}: {
  options: CleanerMatch[]
  picks: string[]
  onToggle: (id: string) => void
  max: number
  disabled?: boolean
}) {
  const atLimit = picks.length >= max
  return (
    <ul className="flex flex-col gap-3">
      {options.map((cleaner) => {
        const checked = picks.includes(cleaner.id)
        return (
          <li
            key={cleaner.id}
            className="rounded-2xl p-4 flex items-center gap-3 border transition-colors"
            style={{ borderColor: checked ? 'var(--color-brand)' : 'transparent', backgroundColor: checked ? '#e8f9fa' : 'var(--color-slate-50)' }}
          >
            <Link href={`/book/schedule/${cleaner.id}?pick=1`} className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200">
                  {cleaner.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cleaner.photoUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-900 truncate">{cleaner.name}</p>
                  {/* Beside the name, not on the photo, where it read as an "online" dot. */}
                  {cleaner.isVerified && <VerifiedCheck size={14} />}
                  {cleaner.isTopTidyPro && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ color: 'var(--color-brand)', backgroundColor: 'color-mix(in srgb, var(--color-brand) 10%, transparent)' }}
                    >
                      Top Tidy Pro
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <IconStar />
                  <span className="text-xs text-slate-600">{cleaner.rating.toFixed(1)}</span>
                  <span className="text-xs text-slate-400">{cleaner.reviewCount}+ reviews</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <IconPin />
                  <span className="text-xs text-slate-400">{cleaner.distanceMiles} miles</span>
                </div>
                <p className="text-xs font-semibold mt-1" style={{ color: 'var(--color-brand)' }}>View profile</p>
              </div>
            </Link>
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              aria-label={`Ask ${cleaner.name}`}
              onClick={() => onToggle(cleaner.id)}
              disabled={disabled || (atLimit && !checked)}
              className="w-11 h-11 flex-shrink-0 flex items-center justify-center disabled:opacity-40"
            >
              <CheckCircle checked={checked} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
