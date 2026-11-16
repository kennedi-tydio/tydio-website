import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'
import Footer from '../components/Footer'
import { FaqBrowser } from '../components/faq/FaqBrowser'

export const metadata: Metadata = {
  title: 'FAQ — Tydio',
  description: 'Answers to common questions about booking, pricing, payments, and working as a Tidy Pro on Tydio.',
}

// Where "Back" goes for someone who came from their profile in the app.
const BACK_LINKS = {
  USER: { href: '/dashboard/profile', label: 'Back to profile' },
  TIDYPRO: { href: '/pro/profile', label: 'Back to profile' },
} as const

export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const [{ q }, session] = await Promise.all([searchParams, getSession()])
  const initialQuery = typeof q === 'string' ? q.slice(0, 100) : ''
  const back = session && session.role !== 'ADMIN' ? BACK_LINKS[session.role] : null

  return (
    <>
      <header className="border-b border-slate-100 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link href="/">
            <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={96} height={35} />
          </Link>
          {back && (
            <Link href={back.href} className="text-sm font-semibold text-sky-600 hover:text-sky-700">
              {back.label}
            </Link>
          )}
        </div>
      </header>

      <main id="main-content" className="flex-1 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Frequently asked questions</h1>
            <p className="mt-3 text-slate-500">
              How Tydio works, and how to get things done in the app.
            </p>
          </div>
          <FaqBrowser initialQuery={initialQuery} />
        </div>
      </main>

      <Footer />
    </>
  )
}
