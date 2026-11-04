import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { backgroundCheckStage } from '@/lib/backgroundCheck'
import { backgroundCheckChargeCents, formatFeeCents } from '@/lib/backgroundCheckFee'
import BackgroundCheckFeeTerms from '../../BackgroundCheckFeeTerms'
import RefreshOnFocus from '../RefreshOnFocus'
import StartBackgroundCheckButton from './StartBackgroundCheckButton'

export const metadata: Metadata = { title: 'Background Check — Tydio' }

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const CONSENT_NOTE =
  "You'll review and complete the disclosure and authorization on Checkr's form before any report is ordered. Your details, including your SSN, are collected by Checkr, never by Tydio."

export default async function OnboardingBackgroundCheckPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('terms_accepted')
    .eq('id', session.profileId)
    .maybeSingle()

  if (!tidyPro?.terms_accepted) redirect('/pro/onboarding')

  const { data: backgroundCheck } = await admin
    .from('background_checks')
    .select('status, requested_at, link_sent_at, submitted_at, background_check_link')
    .eq('pro_id', session.profileId)
    .maybeSingle()

  const stage = backgroundCheckStage(backgroundCheck)
  if (stage === 'pending' || stage === 'passed' || stage === 'failed') redirect('/pro/onboarding/setup')

  const chargeCents = backgroundCheckChargeCents()

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col px-6 pt-6 pb-10">
      <RefreshOnFocus />
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <Link
          href="/pro/onboarding/setup"
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <IconBack />
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 leading-tight mb-3">
          Complete your
          <br />
          background check
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Join our community of verified cleaners to get started with Tydio
        </p>

        <p className="text-sm font-bold mb-3" style={{ color: 'var(--color-brand)' }}>
          We partner with Checkr to conduct background checks
        </p>

        {stage === 'not_started' && chargeCents != null && (
          <>
            <div className="mb-3">
              <BackgroundCheckFeeTerms feeCents={chargeCents} />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              After you pay, we&apos;ll send you Checkr&apos;s form. Paying and agreeing to these terms don&apos;t replace Checkr&apos;s disclosure
              and authorization, which you&apos;ll review and complete there before any report is ordered.
            </p>
            <StartBackgroundCheckButton label={`Pay ${formatFeeCents(chargeCents)} and continue`} feeCents={chargeCents} />
          </>
        )}

        {stage === 'not_started' && chargeCents == null && (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 leading-relaxed">
            Background checks aren&apos;t available right now. Please check back soon.
          </p>
        )}

        {stage === 'needs_link' && (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 leading-relaxed">
            Your payment was received. We&apos;ll email you a link to Checkr&apos;s form soon, and you don&apos;t need to do anything until it arrives.
            {' '}{CONSENT_NOTE}
          </p>
        )}

        {stage === 'link_sent' && (
          <>
            <p className="text-sm text-slate-500 leading-relaxed mb-3">
              {backgroundCheck?.background_check_link
                ? "Your form is ready. We'll update your status here once it's been submitted."
                : "We've asked Checkr to send your form. Check your email for an invitation from Checkr, then complete it there. We'll update your status here once it's been submitted."}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">{CONSENT_NOTE}</p>
            {backgroundCheck?.background_check_link && (
              <a
                href={backgroundCheck.background_check_link}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide text-center block"
                style={{ backgroundColor: 'var(--color-brand)' }}
              >
                Complete your background check
              </a>
            )}
          </>
        )}
      </div>
    </main>
  )
}
