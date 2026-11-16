import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import DownloadAppView from '@/app/components/DownloadAppView'

export const metadata: Metadata = { title: 'Download the app — Tydio' }

export default async function DownloadAppPage() {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  return <DownloadAppView backHref="/pro/profile" notificationsHref="/pro/profile/notifications" />
}
