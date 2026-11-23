import Link from 'next/link'

// A booking on hold until the customer pays: an upcharge the Tydio team added (see
// lib/bookingUpcharges), or a recurring visit whose charge failed (lib/recurringPayments).
// The Tidy Pro can't start or carry on until then; they're notified when it's paid or the
// hold is lifted.
export default function SuspendedBookingView({
  bookingId,
  customerName,
  scheduledDate,
  scheduledTime,
  inProgress,
  reason = 'upcharge',
}: {
  bookingId: string
  customerName: string
  scheduledDate: string | null
  scheduledTime: string | null
  inProgress: boolean
  reason?: 'upcharge' | 'payment'
}) {
  return (
    <main id="main-content" className="min-h-svh bg-white flex flex-col">
      <div className="flex-1 px-5 pt-6 pb-10 max-w-sm mx-auto w-full">
        <Link href="/pro/bookings" className="text-sm text-slate-500 hover:text-slate-700">
          ← Bookings
        </Link>

        <p className="text-sm text-slate-400 mt-5 mb-1">Booking suspended</p>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{customerName}</h1>
        {(scheduledDate || scheduledTime) && (
          <p className="text-sm text-slate-600 mb-6">{[scheduledDate, scheduledTime].filter(Boolean).join(' · ')}</p>
        )}

        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 mb-6">
          <h2 className="text-sm font-bold text-amber-900 mb-1">On hold until the customer pays</h2>
          {reason === 'payment' ? (
            <p className="text-xs text-amber-900">
              The customer&apos;s payment for this recurring visit didn&apos;t go through. Please don&apos;t set off or start. To keep it, they need to
              pay and choose a new date, and we&apos;ll let you know when they do. If they don&apos;t, it&apos;s canceled at its start time.
            </p>
          ) : (
            <p className="text-xs text-amber-900">
              The Tydio team asked the customer to pay an extra charge for this booking.{' '}
              {inProgress ? 'Please pause your work' : 'Please don’t set off or start'} until it’s paid. We’ll notify you as soon as it’s back on.
            </p>
          )}
        </section>

        <Link href={`/pro/messages/${bookingId}`} className="block w-full py-4 rounded-xl text-center text-base text-white bg-brand">
          Message the customer
        </Link>
      </div>
    </main>
  )
}
