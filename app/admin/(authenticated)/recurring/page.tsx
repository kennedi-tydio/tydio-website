import Link from 'next/link'
import RecurringSeries from './RecurringSeries'

export default function AdminRecurringPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Recurring Bookings</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every recurring series. Each visit is booked a week ahead with the same Tidy Pro, tasks, place, time and card, and charged 3 days before it starts. Booked visits also
        appear on the <Link href="/admin/bookings" className="text-brand hover:underline">Bookings</Link> tab, where you can edit or cancel them. Per visit is the total charged for
        the most recent visit not canceled.
      </p>
      <RecurringSeries />
    </div>
  )
}
