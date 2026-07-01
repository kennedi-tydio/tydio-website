import type { Metadata } from 'next'
import { Suspense } from 'react'
import SignupForm from './SignupForm'

export const metadata: Metadata = { title: 'Create account — Tydio' }

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  )
}
