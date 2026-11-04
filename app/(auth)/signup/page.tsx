import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoadingSpinner } from '@/app/components/LoadingSpinner'
import SignupForm from './SignupForm'

export const metadata: Metadata = { title: 'Create account — Tydio' }

export default function SignupPage() {
  return (
    <>
      <h1 className="sr-only">Sign up</h1>
      <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
        <SignupForm />
      </Suspense>
    </>
  )
}
