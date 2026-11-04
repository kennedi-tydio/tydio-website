'use client'

import { useState } from 'react'

export const SEARCH_FIELDS = [
  { value: 'name', label: 'Name', type: 'text', placeholder: 'Type a name…' },
  { value: 'email', label: 'Email', type: 'text', placeholder: 'Type an email…' },
  { value: 'expires', label: 'Expiration date', type: 'date', placeholder: '' },
  { value: 'submitted', label: 'Submitted date', type: 'date', placeholder: '' },
] as const

export type SearchField = (typeof SEARCH_FIELDS)[number]['value']

export default function InsuranceSearch({ status, by, q }: { status: string; by: SearchField; q: string }) {
  const [field, setField] = useState<SearchField>(by)
  // Switching between a text and a date field clears the box, since one can't hold the other.
  const [value, setValue] = useState(q)
  const current = SEARCH_FIELDS.find((f) => f.value === field) ?? SEARCH_FIELDS[0]

  return (
    <form method="get" className="flex flex-wrap gap-2 mb-4 items-center">
      <input type="hidden" name="status" value={status} />
      <select
        aria-label="Search by"
        name="by"
        value={field}
        onChange={(e) => {
          const next = SEARCH_FIELDS.find((f) => f.value === e.target.value) ?? SEARCH_FIELDS[0]
          if (next.type !== current.type) setValue('')
          setField(next.value)
        }}
        className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand"
      >
        {SEARCH_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <input
        aria-label={`Search by ${current.label.toLowerCase()}`}
        name="q"
        type={current.type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={current.placeholder}
        className="w-60 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand transition-colors"
      />
      <button
        type="submit"
        className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        Search
      </button>
      {q && (
        <a href={`/admin/insurance?status=${status}`} className="text-sm text-slate-400 hover:text-slate-600">
          Clear
        </a>
      )}
    </form>
  )
}
