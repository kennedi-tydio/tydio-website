import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBackgroundCheckStepDone, shouldShowVerifiedScreen } from '@/lib/backgroundCheck'

export const metadata: Metadata = { title: 'Get Started — Tydio' }

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()

  const [{ data: tidyPro }, { data: backgroundCheck }] = await Promise.all([
    admin
      .from('tidypro_profiles')
      .select('terms_accepted, cleaner_status, verified_ack_at')
      .eq('id', session.profileId)
      .maybeSingle(),
    admin.from('background_checks').select('status, requested_at, link_sent_at, submitted_at').eq('pro_id', session.profileId).maybeSingle(),
  ])

  if (shouldShowVerifiedScreen(tidyPro, backgroundCheck)) {
    redirect('/pro/onboarding/verified')
  }

  if (tidyPro?.terms_accepted) {
    redirect(isBackgroundCheckStepDone(tidyPro.cleaner_status, backgroundCheck) ? '/pro/dashboard' : '/pro/onboarding/setup')
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col px-6 pt-10 pb-10">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-10">
          <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={100} height={36} priority />
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-3">Welcome!</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Let&apos;s get your cleaner profile set up so you can start accepting jobs
        </p>

        <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
          Here&apos;s what you&apos;ll need to complete:
        </p>
        <ul className="text-sm text-slate-700 leading-relaxed mb-6 list-disc pl-5 space-y-1">
          <li>Complete your background check</li>
          <li>
            Purchase liability insurance <em className="text-slate-400">(Optional)</em>
          </li>
          <li>Build your profile</li>
          <li>Set up your payout method</li>
        </ul>

        <p className="text-sm text-slate-500 leading-relaxed mb-10">
          We do this to keep clients safe and give you full control as an independent cleaner.
          We&apos;ll walk you through each step
        </p>

        <div className="flex-1" />

        <Link
          href="/pro/onboarding/agreements"
          className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide text-center block"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Get Started
        </Link>
      </div>
    </main>
  )
}
