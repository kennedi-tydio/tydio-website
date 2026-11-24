import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import { expireIfDue, originalQuoteTasks, quoteRequestTasks, type QuoteRequestRow } from '@/lib/quoteRequests'
import { signedTaskPhotoUrls } from '@/lib/customerTaskPhotos'
import { customerPetsSummary } from '@/lib/customerPetsData'
import { haversineDistanceMiles } from '@/lib/cleanerMatching'
import { scheduleForViewer } from '@/lib/bookingTime'
import { bookableSelection } from '@/lib/fullServiceBooking'
import { selectionLabel } from '@/lib/fullService'
import { isRecurrenceFrequency } from '@/lib/recurrence'
import { squareFootageLabel } from '@/lib/squareFootage'
import { resolveLocationSquareFootage } from '@/app/dashboard/taskPricing'
import ProQuoteView from './ProQuoteView'

export const metadata: Metadata = { title: 'Quote Request — Tydio' }

export default async function ProQuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') redirect('/login')

  const { quoteId } = await params
  const admin = createAdminClient()

  const { data: loaded } = await admin
    .from('booking_quote_requests')
    .select('*')
    .eq('id', quoteId)
    .eq('tidy_pro_id', session.profileId)
    .maybeSingle()
  if (!loaded) redirect('/pro/messages')
  const row: QuoteRequestRow = await expireIfDue(admin, loaded)
  if (row.tidy_pro_unread) await admin.from('booking_quote_requests').update({ tidy_pro_unread: false }).eq('id', row.id)

  // The tasks as asked for, with this Tidy Pro's prices on any they've already quoted.
  const tasks = originalQuoteTasks(row)
  const quotedTasks = quoteRequestTasks(row)
  const quotedPrices: Record<string, number> = {}
  for (const t of quotedTasks) {
    if (t.quotedByTidyPro && t.quotedPrice != null) quotedPrices[t.id] = t.quotedPrice
  }

  const location = row.scheduled_location as ScheduledLocation | null
  const [{ data: customer }, { data: me }] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, photo_url').eq('id', row.user_id).maybeSingle(),
    admin.from('tidypro_profiles').select('latitude, longitude, time_zone').eq('id', session.profileId).maybeSingle(),
  ])
  const schedule = scheduleForViewer(row.scheduled_date, row.scheduled_time, row.time_zone, me?.time_zone ?? null)
  const distanceMiles =
    location?.latitude != null && location?.longitude != null && me?.latitude != null && me?.longitude != null
      ? Math.round(haversineDistanceMiles({ latitude: location.latitude, longitude: location.longitude }, { latitude: me.latitude, longitude: me.longitude }) * 10) / 10
      : null
  const fullService = bookableSelection(row.full_service)

  return (
    <ProQuoteView
      quoteId={row.id}
      status={row.status}
      bookingId={row.booking_id}
      customerName={customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Customer' : 'Customer'}
      customerPhotoUrl={customer?.photo_url ?? null}
      date={schedule.date ?? row.scheduled_date}
      time={schedule.time ?? row.scheduled_time}
      recurring={isRecurrenceFrequency(row.recurrence_frequency)}
      addressLabel={location?.type === 'address' ? location.label : null}
      addressLine={location?.type === 'address' ? location.line : null}
      distanceMiles={distanceMiles}
      homeSize={squareFootageLabel(await resolveLocationSquareFootage(admin, row.user_id, location))}
      tasks={tasks}
      quotedPrices={quotedPrices}
      fullServiceLabel={fullService ? selectionLabel(fullService) : null}
      photoUrls={await signedTaskPhotoUrls(admin, tasks)}
      pets={(await customerPetsSummary(admin, row.user_id)) ?? 'No pets'}
      notes={row.notes}
      suppliesProvided={row.supplies_provided}
      tidyProNote={row.tidy_pro_note}
      quotedServicePrice={row.quoted_service_price}
      quotedCleanerPay={row.quoted_cleaner_pay}
    />
  )
}
