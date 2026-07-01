import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = { title: 'Reset Password — Tydio' }

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="block mb-8 text-center">
          <span className="text-2xl font-bold tracking-tight" style={{ color: '#1a2332' }}>
            Tydio
          </span>
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-5">Set a new password</h1>
          <Suspense>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
