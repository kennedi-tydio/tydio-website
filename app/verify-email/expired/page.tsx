import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Link Expired — Tydio' }

export default function VerifyExpiredPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="block mb-8">
          <span className="text-2xl font-bold tracking-tight" style={{ color: '#1a2332' }}>
            Tydio
          </span>
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center bg-red-50">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-slate-900 text-lg">Link expired or invalid</p>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              This verification link has already been used or has expired.
              Sign in and we&apos;ll give you the option to resend a new one.
            </p>
          </div>
          <Link
            href="/login"
            className="mt-2 w-full py-3 rounded-xl text-white font-semibold text-sm text-center"
            style={{ backgroundColor: '#38C7CA' }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
