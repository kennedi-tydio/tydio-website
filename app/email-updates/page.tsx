import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { readMarketingOptInToken } from '@/lib/waitlistEmail'
import { optInToEmailsAction } from './actions'

export const metadata: Metadata = { title: 'Email updates — Tydio' }

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm text-center">
        <Link href="/" className="block mb-8">
          <span className="text-2xl font-bold tracking-tight" style={{ color: '#1a2332' }}>
            Tydio
          </span>
        </Link>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col items-center gap-4">
          <h1 className="font-bold text-slate-900 text-lg">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  )
}

// Linked from the waitlist email for people who didn't tick the marketing box at signup.
export default async function EmailUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>
}) {
  const { token, done } = await searchParams
  const profileId = await readMarketingOptInToken(typeof token === 'string' ? token : null)

  const { data: profile } = profileId
    ? await createAdminClient().from('profiles').select('email, marketing_opt_in_at').eq('id', profileId).maybeSingle()
    : { data: null }

  if (!profile) {
    return (
      <Card title="Link expired or invalid">
        <p className="text-sm text-slate-500 leading-relaxed">
          This link doesn&apos;t work any more. Sign in to Tydio to manage your email settings.
        </p>
      </Card>
    )
  }

  if (profile.marketing_opt_in_at) {
    return (
      <Card title={done ? "You're signed up!" : "You're already signed up"}>
        <p className="text-sm text-slate-500 leading-relaxed">
          We&apos;ll send Tydio news and updates to <span className="font-semibold">{profile.email}</span> until we
          launch in your area. You can unsubscribe at any time from the link at the bottom of any of these emails.
        </p>
      </Card>
    )
  }

  return (
    <Card title="Stay updated about Tydio">
      <p className="text-sm text-slate-500 leading-relaxed">
        Get occasional emails with Tydio news, tips, and offers at{' '}
        <span className="font-semibold">{profile.email}</span>, so you know when we launch in your area. You can
        unsubscribe at any time.
      </p>
      <form action={optInToEmailsAction} className="w-full">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="mt-2 w-full py-3 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: 'var(--color-brand)' }}
        >
          Sign me up for emails
        </button>
      </form>
    </Card>
  )
}
