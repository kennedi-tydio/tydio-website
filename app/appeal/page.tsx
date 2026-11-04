import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { appealDeadline, formatDeadline } from '@/lib/appealWindow'
import { TYDIO_ADMIN_EMAIL } from '@/lib/email'
import AppealForm from './AppealForm'

export const metadata: Metadata = { title: 'Appeal a Decision — Tydio' }

type Appeal = { kind: 'ban' | 'background_check'; openedAt: string; submitted: boolean; closed: boolean }

// The token is from a ban email or a background check denial email.
async function findAppeal(token: string): Promise<Appeal | null> {
  if (!token) return null
  const admin = createAdminClient()

  const { data: ban } = await admin
    .from('banned_users')
    .select('banned_at, appeal_submitted_at, appeal_denied_at, account_deleted_at')
    .eq('appeal_token', token)
    .maybeSingle()
  if (ban) {
    return {
      kind: 'ban',
      openedAt: ban.banned_at,
      submitted: Boolean(ban.appeal_submitted_at),
      closed: Boolean(ban.appeal_denied_at || ban.account_deleted_at),
    }
  }

  const { data: denial } = await admin
    .from('background_checks')
    .select('denied_at, appeal_submitted_at')
    .eq('appeal_token', token)
    .maybeSingle()
  if (denial) {
    // denied_at is cleared once the decision is final, or the appeal accepted.
    return {
      kind: 'background_check',
      openedAt: denial.denied_at ?? '',
      submitted: Boolean(denial.appeal_submitted_at),
      closed: !denial.denied_at,
    }
  }
  return null
}

// Reached from the link in the email. The token is the way in, since a banned
// person can't sign in.
export default async function AppealPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  const appeal = await findAppeal(token)
  const subject = appeal?.kind === 'background_check' ? 'background check decision' : 'ban'

  let body: React.ReactNode
  if (!appeal) {
    body = <Notice>This appeal link is invalid. If you think a decision on your account is a mistake, email {TYDIO_ADMIN_EMAIL}.</Notice>
  } else if (appeal.closed) {
    body = <Notice>This appeal is closed. We&apos;ve emailed you the outcome.</Notice>
  } else if (appeal.submitted) {
    const deadline = formatDeadline(appealDeadline(appeal.openedAt))
    body = (
      <Notice>
        We&apos;ve received your appeal and will email you once it has been reviewed. Unless it&apos;s accepted by {deadline},
        your account will be closed on that date.
      </Notice>
    )
  } else if (new Date() >= appealDeadline(appeal.openedAt)) {
    body = <Notice>The time to appeal this {subject} has passed.</Notice>
  } else {
    const deadline = formatDeadline(appealDeadline(appeal.openedAt))
    body = (
      <>
        <p className="text-sm text-slate-500 mb-5 leading-relaxed">
          Tell us why you think the {subject} should be changed. You can send one appeal. We need to accept it by{' '}
          {deadline}; if we don&apos;t, your account is closed and its data permanently deleted on that date.
        </p>
        <AppealForm token={token} />
      </>
    )
  }

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="block mb-8 text-center">
          <span className="text-2xl font-bold tracking-tight" style={{ color: '#1a2332' }}>
            Tydio
          </span>
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-5">
            {appeal?.kind === 'background_check' ? 'Appeal your background check decision' : 'Appeal your ban'}
          </h1>
          {body}
        </div>
      </div>
    </main>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-600 leading-relaxed">{children}</p>
}
