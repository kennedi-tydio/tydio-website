import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import PostHogIdentify from '@/app/components/PostHogIdentify'
import SignOutForm from '@/app/components/SignOutForm'

export const metadata: Metadata = { title: "You're on the Waitlist — Tydio" }

// Every new account lands here after signup until an admin grants or denies
// access from /admin/users. The /dashboard and /pro layouts redirect waitlisted
// and denied accounts here.
export default async function WaitlistPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isPro = session.role === 'TIDYPRO'
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, email, booking_access_status')
    .eq('id', session.profileId)
    .maybeSingle()

  if (!profile) redirect('/account-removed')
  const denied = profile.booking_access_status === 'denied'
  if (profile.booking_access_status !== 'waitlisted' && !denied) redirect(isPro ? '/pro/onboarding' : '/dashboard')

  if (denied) {
    return (
      <main id="main-content" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
        <PostHogIdentify profileId={session.profileId} role={session.role} />
        <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={120} height={44} priority className="mb-8" />

        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col items-center text-center gap-4">
          <div>
            <h1 className="font-bold text-slate-900 text-xl">
              Thanks for your interest{profile.first_name ? `, ${profile.first_name}` : ''}
            </h1>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              We&apos;re only able to bring a limited number of people on during early access, and we
              can&apos;t offer you access at this time.
            </p>
          </div>

          <SignOutForm className="w-full mt-2" buttonClassName="w-full py-3 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700" />
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <PostHogIdentify profileId={session.profileId} role={session.role} />
      <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={120} height={44} priority className="mb-8" />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e8f9fa' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>

        <div>
          <h1 className="font-bold text-slate-900 text-xl">
            You&apos;re on the waitlist{profile.first_name ? `, ${profile.first_name}` : ''}!
          </h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            {isPro
              ? "Thanks for applying to be a Tidy Pro. We're bringing cleaners on a few at a time during early access, and we'll let you know as soon as you can start setting up your profile."
              : "Thanks for signing up. We're letting customers in a few at a time during early access, and we'll let you know as soon as you can book your first cleaning."}
          </p>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">
            Keep an eye on <span className="font-medium text-slate-700">{profile.email}</span>.
          </p>
        </div>

        <SignOutForm className="w-full mt-2" buttonClassName="w-full py-3 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-700" />
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center max-w-xs">
        Tydio Lite is an early access version of the full Tydio app.
      </p>
    </div>
  )
}
