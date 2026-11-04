import Link from 'next/link'
import HighContrastToggle from '@/app/components/HighContrastToggle'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function AccessibilityView({ backHref }: { backHref: string }) {
  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link
          href={backHref}
          aria-label="Back to Profile"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <IconBack />
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Accessibility</h1>

        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-4">
          <HighContrastToggle />
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          Having trouble using Tydio? Read our{' '}
          <Link href="/accessibility" className="text-brand underline underline-offset-2">accessibility statement</Link>{' '}
          to learn how to reach us for help.
        </p>
      </div>
    </main>
  )
}
