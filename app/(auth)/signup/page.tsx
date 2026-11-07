import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingSpinner } from '@/app/components/LoadingSpinner'
import SignupForm from './SignupForm'
import { getPendingGoogleSignup, isGoogleSignInEnabled } from '@/lib/auth/google'

export const metadata: Metadata = { title: 'Create account — Tydio' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; role?: string }>
}) {
  const { google, role } = await searchParams
  // Set by /auth/google/callback when a Google sign-in had no account yet.
  const pending = google === '1' ? await getPendingGoogleSignup() : null
  const pendingForThisRole = pending && pending.role === (role === 'pro' ? 'TIDYPRO' : 'USER') ? pending : null

  return (
    <>
      <h1 className="sr-only">Sign up</h1>
      <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
        <SignupForm
          googleEnabled={isGoogleSignInEnabled()}
          google={pendingForThisRole && { email: pendingForThisRole.email, firstName: pendingForThisRole.firstName, lastName: pendingForThisRole.lastName }}
        />
      </Suspense>
    </>
  )
}
