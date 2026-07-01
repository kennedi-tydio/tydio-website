import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import AuthTabs from './AuthTabs'
import RoleSelector from './RoleSelector'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-2">
        <Image
          src="/Tydio Logo No Bkg.png"
          alt="Tydio"
          width={120}
          height={44}
          priority
        />
      </Link>

      {/* Tydio Lite badge */}
      <div className="flex items-center gap-1.5 mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
        <span className="text-xs font-semibold text-sky-600 tracking-wide uppercase">
          Tydio Lite — Early Access
        </span>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <Suspense fallback={null}>
          <RoleSelector />
        </Suspense>
        <Suspense fallback={null}>
          <AuthTabs />
        </Suspense>
        {children}
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center max-w-xs">
        Tydio Lite is an early access version of the full Tydio app.
      </p>
    </div>
  )
}
