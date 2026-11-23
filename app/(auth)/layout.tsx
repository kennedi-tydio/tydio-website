import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import AuthTabs from './AuthTabs'
import RoleSelector from './RoleSelector'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="min-h-svh bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <Image
          src="/Tydio Logo No Bkg.png"
          alt="Tydio"
          width={120}
          height={44}
          priority
        />
      </Link>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <Suspense fallback={null}>
          <RoleSelector />
        </Suspense>
        <Suspense fallback={null}>
          <AuthTabs />
        </Suspense>
        {children}
      </div>
    </main>
  )
}
