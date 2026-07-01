import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Book a Cleaning — Tydio' }

export default function BookPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Booking form coming soon</h1>
        <p className="text-slate-500 mt-2">Phase 3 — AI validation + booking form</p>
      </div>
    </div>
  )
}
