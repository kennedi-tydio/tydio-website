import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { backgroundCheckStage, backgroundCheckStatusLabel, isPastBackgroundCheckScreens } from '@/lib/backgroundCheck'

export const metadata: Metadata = { title: "You're Almost There — Tydio" }

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

function IconShieldOutline() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="9" r="3" />
      <path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M15 14.5c2.8.3 5 2.7 5 5.5" />
    </svg>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex-shrink-0 text-xs font-semibold px-3 py-1 rounded-full" style={{ color: 'var(--color-brand)', backgroundColor: '#e8f9fa' }}>
      {children}
    </span>
  )
}

export default async function OnboardingAlmostTherePage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const admin = createAdminClient()
  const { data: tidyPro } = await admin
    .from('tidypro_profiles')
    .select('terms_accepted, cleaner_status')
    .eq('id', session.profileId)
    .maybeSingle()

  const { data: backgroundCheck } = await admin
    .from('background_checks')
    .select('status, requested_at, link_sent_at, submitted_at')
    .eq('pro_id', session.profileId)
    .maybeSingle()

  // Shown as soon as the check is paid for (or requested, when there's no fee),
  // not just once the form is in, so the cleaner knows to watch for the email.
  const stage = backgroundCheckStage(backgroundCheck)
  if (
    !tidyPro?.terms_accepted ||
    stage === 'not_started' ||
    isPastBackgroundCheckScreens(tidyPro.cleaner_status, backgroundCheck)
  ) {
    redirect('/pro/onboarding')
  }

  const { data: insuranceProfile } = await admin
    .from('tidypro_profiles')
    .select('insurance_status')
    .eq('id', session.profileId)
    .maybeSingle()

  const { data: profile } = await admin.from('profiles').select('email').eq('id', session.profileId).maybeSingle()
  const email = profile?.email ?? session.email

  const backgroundCheckNote =
    stage === 'needs_link'
      ? `Stay tuned to your inbox at ${email}. We'll email you a link to complete your background check soon.`
      : stage === 'link_sent'
      ? `We've emailed a link to complete your background check to ${email}. Check your inbox, and your spam folder too.`
      : stage === 'failed'
      ? 'Your background check was not approved.'
      : "You've submitted your background check, and it's being reviewed."

  const insuranceStatus = insuranceProfile?.insurance_status ?? null
  const insuranceBadgeLabel =
    insuranceStatus === 'approved' ? 'Insured' : insuranceStatus === 'pending' ? 'Pending' : insuranceStatus === 'denied' ? 'Denied' : insuranceStatus === 'expired' ? 'Expired' : 'Optional'

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col px-6 pt-6 pb-10">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <Link href="/pro/onboarding/setup" aria-label="Back" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2">
            <IconBack />
          </Link>
          <Link href="/pro/dashboard" aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -mr-2">
            <IconClose />
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 leading-tight mb-3">
          You&apos;re Almost
          <br />
          There!
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          We&apos;re reviewing your information now, this usually takes 1-3 business days.
        </p>

        <div className="flex flex-col gap-3 mb-6">
          <div className="rounded-2xl border border-slate-100 px-4 py-4 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
              <IconShieldOutline />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Complete your background check</p>
              <p className="text-xs text-slate-500 leading-relaxed mt-1 break-words">{backgroundCheckNote}</p>
            </div>
            <Badge>{backgroundCheckStatusLabel(backgroundCheck)}</Badge>
          </div>
          <Link
            href="/pro/profile/insurance"
            className="rounded-2xl border border-slate-100 px-4 py-4 flex items-center gap-3 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
              <IconPeople />
            </div>
            <p className="text-sm font-bold text-slate-900 flex-1">Purchase or upload liability insurance</p>
            <Badge>{insuranceBadgeLabel}</Badge>
          </Link>
        </div>

        <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
          Once you&apos;re verified, you&apos;ll be able to:
        </p>
        <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1 mb-6">
          <li>Set up your payment info</li>
          <li>Choose your availability</li>
          <li>Start accepting cleaning tasks!</li>
        </ul>

        <p className="text-sm text-slate-500 leading-relaxed mb-4">
          In the meantime, feel free to explore the app and get familiar with how it works.
        </p>

        <p className="text-xs text-slate-400 leading-relaxed">
          We&apos;ll notify you as soon as you&apos;re approved and ready to start earning.
        </p>

        <div className="flex-1" />

        <Link
          href="/pro/dashboard"
          className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide text-center block"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Continue
        </Link>
      </div>
    </main>
  )
}
