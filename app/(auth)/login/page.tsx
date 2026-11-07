import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingSpinner } from '@/app/components/LoadingSpinner'
import LoginForm from './LoginForm'
import { isGoogleSignInEnabled } from '@/lib/auth/google'

export const metadata: Metadata = { title: 'Sign in — Tydio' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <>
      <h1 className="sr-only">Log in</h1>
      <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
        <LoginForm next={typeof next === 'string' ? next : undefined} googleEnabled={isGoogleSignInEnabled()} />
      </Suspense>
    </>
  )
}
