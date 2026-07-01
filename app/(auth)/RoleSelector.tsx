'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

export default function RoleSelector() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const role = searchParams.get('role') ?? 'user'

  const setRole = useCallback(
    (r: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('role', r)
      router.replace(`${pathname}?${params.toString()}`)
    },
    [searchParams, pathname, router]
  )

  return (
    <div className="flex gap-3 mb-6">
      <button
        type="button"
        onClick={() => setRole('user')}
        className={`flex-1 flex flex-col items-center gap-1.5 rounded-2xl border-2 px-4 py-4 transition-all text-left ${
          role === 'user'
            ? 'border-sky-400 bg-sky-50'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <span className="text-xl">🛁</span>
        <span className={`text-sm font-semibold ${role === 'user' ? 'text-sky-700' : 'text-slate-700'}`}>
          Book a cleaner
        </span>
        <span className={`text-xs ${role === 'user' ? 'text-sky-500' : 'text-slate-400'}`}>
          I need my home cleaned
        </span>
      </button>

      <button
        type="button"
        onClick={() => setRole('pro')}
        className={`flex-1 flex flex-col items-center gap-1.5 rounded-2xl border-2 px-4 py-4 transition-all text-left ${
          role === 'pro'
            ? 'border-sky-400 bg-sky-50'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <span className="text-xl">🧹</span>
        <span className={`text-sm font-semibold ${role === 'pro' ? 'text-sky-700' : 'text-slate-700'}`}>
          Be a cleaner
        </span>
        <span className={`text-xs ${role === 'pro' ? 'text-sky-500' : 'text-slate-400'}`}>
          I want to earn as a Tidy Pro
        </span>
      </button>
    </div>
  )
}
