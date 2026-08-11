import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Get Started — Tydio' }

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name')
    .eq('id', session.profileId)
    .single()

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: '#e8f9fa' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38C7CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        Welcome to Tydio, {profile?.first_name ?? 'there'}!
      </h1>
      <p className="text-sm text-slate-500 max-w-xs mb-8 leading-relaxed">
        We&apos;re still building out your onboarding — background check, payout setup, and
        availability are coming soon. For now, head to your dashboard to take a look around.
      </p>
      <Link
        href="/pro/dashboard"
        className="px-8 py-3.5 rounded-2xl text-white font-semibold text-sm tracking-wide"
        style={{ backgroundColor: '#1a2332' }}
      >
        Continue to Dashboard
      </Link>
    </div>
  )
}
