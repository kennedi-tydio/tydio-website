import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Sign in — Tydio' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <Suspense fallback={null}>
      <LoginForm next={typeof next === 'string' ? next : undefined} />
    </Suspense>
  )
}
