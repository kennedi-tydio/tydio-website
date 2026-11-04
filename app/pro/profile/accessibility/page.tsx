import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import AccessibilityView from '@/app/components/AccessibilityView'

export const metadata: Metadata = { title: 'Accessibility — Tydio' }

export default async function ProAccessibilitySettingsPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  return <AccessibilityView backHref="/pro/profile" />
}
