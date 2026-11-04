import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { shouldShowVerifiedScreen } from '@/lib/backgroundCheck'
import { acknowledgeVerifiedAction } from '../actions'

export const metadata: Metadata = { title: "You've Been Verified — Tydio" }

export default async function OnboardingVerifiedPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const [{ data: tidyPro }, { data: backgroundCheck }] = await Promise.all([
    admin.from('tidypro_profiles').select('cleaner_status, verified_ack_at').eq('id', session.profileId).maybeSingle(),
    admin.from('background_checks').select('status, requested_at, link_sent_at, submitted_at').eq('pro_id', session.profileId).maybeSingle(),
  ])

  if (!shouldShowVerifiedScreen(tidyPro, backgroundCheck)) redirect('/pro/onboarding')

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col px-6 pt-10 pb-10">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <h1 className="text-3xl font-bold text-slate-900 leading-tight mb-3">
          You&apos;ve Been
          <br />
          Verified!
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          You are now a part of our trusted Tidy Pro community
        </p>

        <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
          As a verified Tidy Pro, you can now:
        </p>
        <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1">
          <li>Set up your payment info</li>
          <li>Choose your availability</li>
          <li>Start accepting cleaning tasks!</li>
        </ul>

        <div className="flex-1" />

        <form action={acknowledgeVerifiedAction}>
          <button
            type="submit"
            className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  )
}
