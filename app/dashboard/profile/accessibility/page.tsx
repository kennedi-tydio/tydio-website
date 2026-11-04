import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import AccessibilityView from '@/app/components/AccessibilityView'

export const metadata: Metadata = { title: 'Accessibility — Tydio' }

export default async function AccessibilitySettingsPage() {
  const session = await getSession()
  if (!session || session.role !== 'USER') redirect('/login')

  return <AccessibilityView backHref="/dashboard/profile" />
}
