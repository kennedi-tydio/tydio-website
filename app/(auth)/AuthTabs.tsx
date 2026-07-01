'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export default function AuthTabs() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isSignup = pathname === '/signup'

  const roleParam = searchParams.get('role') ? `?role=${searchParams.get('role')}` : ''

  return (
    <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
      <Link
        href={`/signup${roleParam}`}
        className={`flex-1 text-center text-sm font-semibold py-2 rounded-lg transition-all ${
          isSignup
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Create account
      </Link>
      <Link
        href={`/login${roleParam}`}
        className={`flex-1 text-center text-sm font-semibold py-2 rounded-lg transition-all ${
          !isSignup
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Sign in
      </Link>
    </div>
  )
}
