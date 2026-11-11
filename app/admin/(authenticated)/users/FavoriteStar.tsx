'use client'

import { useState, useTransition } from 'react'
import { setFavoriteTidyProAction } from '../../actions'

// The admin's star on a Tidy Pro. It flips straight away and flips back if the save fails.
export function FavoriteStar({ proId, name, initialFavorite, size = 16 }: { proId: string; name: string; initialFavorite: boolean; size?: number }) {
  const [favorite, setFavorite] = useState(initialFavorite)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !favorite
    setFavorite(next)
    setError(null)
    startTransition(async () => {
      const result = await setFavoriteTidyProAction(proId, next)
      if (result.error) {
        setFavorite(!next)
        setError(result.error)
      }
    })
  }

  const label = favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`
  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={favorite}
        aria-label={label}
        title={error ?? label}
        className="flex-shrink-0 rounded p-0.5 hover:bg-slate-100 disabled:opacity-60"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={favorite ? '#f59e0b' : 'none'}
          stroke={error ? '#ef4444' : favorite ? '#f59e0b' : 'var(--color-slate-400)'}
          strokeWidth="2"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
        </svg>
      </button>
      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </span>
  )
}
