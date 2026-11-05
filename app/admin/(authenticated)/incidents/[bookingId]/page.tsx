import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { INCIDENT_LABELS, REFUND_LEVEL_LABELS, incidentCleanerPay, incidentRefundAmount } from '@/lib/bookingIncidents'
import { serviceAddressText } from '@/lib/bookingIncidentEmail'
import { bookingStartInstant } from '@/lib/bookingTime'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import ResolveIncidentForm from './ResolveIncidentForm'

function money(value: number | null | undefined): string {
  return value == null ? '—' : `$${Number(value).toFixed(2)}`
}

function inZone(iso: string | null, timeZone: string): string {
  return iso ? new Date(iso).toLocaleString('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function Card({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">{title}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-400">{label}</dt>
            <dd className="text-slate-800 whitespace-pre-line break-words">{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Phone({ number }: { number: string | null | undefined }) {
  return number ? <a href={`tel:${number}`} className="underline">{number}</a> : <>—</>
}

export default async function AdminIncidentPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  const admin = createAdminClient()

  const { data: booking } = await admin.from('bookings').select('*').eq('id', bookingId).maybeSingle()
  if (!booking?.incident_type) notFound()

  const [{ data: customer }, { data: cleaner }, { data: tidyPro }, { data: tasks }, { data: riskEvents }] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, email, phone, street_address, zip_code').eq('id', booking.user_id).maybeSingle(),
    booking.tidy_pro_id
      ? admin.from('profiles').select('first_name, last_name, email, phone').eq('id', booking.tidy_pro_id).maybeSingle()
      : Promise.resolve({ data: null }),
    booking.tidy_pro_id
      ? admin.from('tidypro_profiles').select('phone, street_address, unit_number, city, state, zip_code, cleaner_status').eq('id', booking.tidy_pro_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('booking_tasks').select('task_name, task_category').eq('booking_id', booking.id),
    booking.tidy_pro_id
      ? admin
          .from('risk_events')
          .select('id, event_type, severity, description, created_at, resolved_at')
          .eq('user_id', booking.tidy_pro_id)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ])

  const tz = booking.time_zone
  const resolved = booking.incident_resolved_at != null
  const options = (['full', 'half', 'none'] as const).map((level) => ({
    level,
    label: REFUND_LEVEL_LABELS[level],
    refund: booking.stripe_payment_intent_id ? incidentRefundAmount(level, booking.total_customer_charge ?? 0) : 0,
    cleanerPay: incidentCleanerPay(level, booking.cleaner_pay ?? 0),
  }))
  const start =
    booking.scheduled_date && booking.scheduled_time
      ? inZone(bookingStartInstant(booking.scheduled_date, booking.scheduled_time, tz).toISOString(), tz)
      : booking.scheduled_date
        ? `${booking.scheduled_date}, anytime`
        : null

  return (
    <div className="max-w-4xl">
      <Link href="/admin/incidents" className="text-sm text-slate-400 hover:text-slate-600">← Incidents</Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-2 mb-1">{INCIDENT_LABELS[booking.incident_type]}</h1>
      <p className="text-sm text-slate-500 mb-6">
        Reported {inZone(booking.incident_reported_at, tz)} by the {booking.incident_type === 'no_access' ? 'cleaner' : 'customer'}.
        {resolved && ` Settled ${inZone(booking.incident_resolved_at, tz)}.`}
      </p>

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Card
          title="Customer"
          rows={[
            ['Name', [customer?.first_name, customer?.last_name].filter(Boolean).join(' ')],
            ['Phone', <Phone key="phone" number={customer?.phone} />],
            ['Email', customer?.email],
            ['Home address', [customer?.street_address, customer?.zip_code].filter(Boolean).join(', ')],
          ]}
        />
        <Card
          title="Cleaner"
          rows={[
            ['Name', [cleaner?.first_name, cleaner?.last_name].filter(Boolean).join(' ') || booking.tidy_pro_name],
            ['Phone', <Phone key="phone" number={tidyPro?.phone ?? cleaner?.phone} />],
            ['Email', cleaner?.email],
            ['Address', [tidyPro?.street_address, tidyPro?.unit_number, tidyPro?.city, tidyPro?.state, tidyPro?.zip_code].filter(Boolean).join(', ')],
            ['Account', tidyPro?.cleaner_status],
          ]}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <Card
          title="Booking"
          rows={[
            ['Booking ID', booking.id],
            ['Start', start],
            ['Cleaner arrived', booking.arrived_at ? inZone(booking.arrived_at, tz) : 'Never marked arrived'],
            ['Service address', serviceAddressText(booking.scheduled_location as ScheduledLocation | null)],
            ['Entry instructions', booking.entry_instructions],
            ['Tasks', (tasks ?? []).map((t) => `${t.task_name} (${t.task_category})`).join('\n') || booking.task_description],
            ['Notes', booking.notes],
          ]}
        />
        <Card
          title="Payment"
          rows={[
            ['Total charged', money(booking.total_customer_charge)],
            [resolved ? 'Cleaner paid' : 'Cleaner pay', money(booking.cleaner_pay)],
            ['Refund', resolved && booking.incident_refund_level ? REFUND_LEVEL_LABELS[booking.incident_refund_level] : 'Not settled'],
            ['Note', booking.incident_note],
            [
              'Stripe payment',
              booking.stripe_payment_intent_id ? (
                <a
                  key="stripe"
                  href={`https://dashboard.stripe.com/payments/${booking.stripe_payment_intent_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {booking.stripe_payment_intent_id}
                </a>
              ) : null,
            ],
          ]}
        />
      </div>

      {(riskEvents ?? []).length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Cleaner&apos;s recent flags</h2>
          <ul className="space-y-1.5 text-sm">
            {(riskEvents ?? []).map((e) => (
              <li key={e.id} className="text-slate-600">
                <span className="text-slate-400">{new Date(e.created_at).toLocaleDateString()}</span> {e.event_type} ({e.severity})
                {e.description ? ` — ${e.description}` : ''}
                {e.resolved_at ? <span className="text-slate-400"> · resolved</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!resolved && (
        <ResolveIncidentForm
          bookingId={booking.id}
          options={options}
          canPause={booking.tidy_pro_id != null && tidyPro?.cleaner_status !== 'paused'}
          suggestPause={booking.incident_type === 'cleaner_no_show'}
        />
      )}
    </div>
  )
}
