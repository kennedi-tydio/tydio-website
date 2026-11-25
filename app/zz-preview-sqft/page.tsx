// TEMPORARY preview of home size + supplies notice on Tidy Pro screens. Delete after review.
import ProMessageThreadView from '@/app/pro/messages/[bookingId]/ProMessageThreadView'
import ProQuoteView from '@/app/pro/quotes/[quoteId]/ProQuoteView'
import TaskListView from '@/app/pro/bookings/[bookingId]/TaskListView'
import PastBookingDetailView from '@/app/pro/bookings/[bookingId]/PastBookingDetailView'
import OnTheWayView from '@/app/pro/bookings/[bookingId]/OnTheWayView'

function isoInDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const tasks = [
  { id: 't1', name: 'Clean kitchen counters', notes: '', room: 'Kitchen', dirtLevel: 'standard', unusual: [], completed: false },
  { id: 't2', name: 'Vacuum living room', notes: '', room: 'Living Room', dirtLevel: 'light', unusual: [], completed: false },
] as never

const fsSelection = {
  version: 1 as const,
  type: 'deep' as const,
  scope: 'entire_home' as const,
  rooms: {},
  addOns: { inside_fridge: 1, inside_oven: 1 },
  priorities: ['bathroom_fixtures', 'floors'],
  step: 'notes' as const,
} as never
const fsLines = [
  { kind: 'home' as const, label: 'Deep Cleaning · Entire home', quantity: 1, customer_price: 240, take_home: 192 },
  { kind: 'addon' as const, label: 'Inside refrigerator', quantity: 1, customer_price: 45, take_home: 36 },
  { kind: 'addon' as const, label: 'Inside oven', quantity: 1, customer_price: 45, take_home: 36 },
]

export default async function Preview({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v = 'request' } = await searchParams
  if (v === 'upcoming' || v === 'upcoming-no-supplies') {
    return (
      <PastBookingDetailView
        variant="upcoming"
        bookingId="b"
        customerName="Jordan Ellis"
        fullService={{ selection: fsSelection, lines: fsLines }}
        scheduledDate={isoInDays(2)}
        scheduledTime="10:00"
        startsAtMs={null}
        durationMinutes={240}
        addressLabel="Home"
        addressArea="412 Oak St, Austin, TX"
        tasks={[{ id: 'h', task_name: 'Deep Cleaning · Entire home', task_category: 'Home', task_icon: null, is_completed: false, completion_photo_url: null, before_photo_url: null, kind: 'home' }]}
        suppliesProvided={v === 'upcoming'}
        pets={null}
        notes={null}
        bookingEarnings={264}
        tipAmount={0}
        canLeaveReview={false}
      />
    )
  }
  if (v === 'otw' || v === 'otw-no-supplies') {
    return (
      <OnTheWayView
        bookingId="b"
        fullService
        customerName="Jordan Ellis"
        customerPhotoUrl={null}
        scheduledDate={isoInDays(0)}
        scheduledTime="10:00"
        durationMinutes={240}
        addressLabel="Home"
        addressLine="412 Oak St, Austin, TX"
        entryInstructions="Gate code 4821, key under the mat."
        tasks={[{ id: 'h', taskName: 'Deep Cleaning · Entire home' }, { id: 'a1', taskName: 'Inside refrigerator' }]}
        suppliesProvided={v === 'otw'}
      />
    )
  }
  if (v === 'fs-quote') {
    return (
      <ProQuoteView
        quoteId="q"
        status={'pending' as never}
        bookingId={null}
        customerName="Jordan Ellis"
        customerPhotoUrl={null}
        date={isoInDays(3)}
        time="10:00"
        recurring={false}
        addressLabel="Home"
        addressLine="412 Oak St, Austin, TX"
        distanceMiles={4.2}
        homeSize="3,000+ sqft"
        tasks={[]}
        quotedPrices={{}}
        fullServiceLabel="Deep Cleaning · Entire home"
        photoUrls={{}}
        pets="1 dog"
        notes={null}
        suppliesProvided
        tidyProNote={null}
        quotedServicePrice={null}
        quotedCleanerPay={null}
      />
    )
  }
  if (v === 'fs-job') {
    return (
      <TaskListView
        bookingId="b"
        fullService={{ selection: fsSelection, lines: fsLines }}
        customerName="Jordan Ellis"
        addressLabel="Home"
        scheduledDate={isoInDays(0)}
        scheduledTime="10:00"
        durationMinutes={240}
        pets={null}
        notes={null}
        suppliesProvided={false}
        tasks={[
          { id: 'h', task_name: 'Deep Cleaning · Entire home', task_category: 'Home', task_icon: null, is_completed: false, completion_photo_url: null, before_photo_url: null, kind: 'home' },
          { id: 'a1', task_name: 'Inside refrigerator', task_category: 'Add-on', task_icon: null, is_completed: false, completion_photo_url: null, before_photo_url: null, kind: 'addon' },
        ]}
      />
    )
  }
  if (v === 'quote') {
    return (
      <ProQuoteView
        quoteId="q"
        status={'pending' as never}
        bookingId={null}
        customerName="Jordan Ellis"
        customerPhotoUrl={null}
        date={isoInDays(3)}
        time="10:00"
        recurring={false}
        addressLabel="Home"
        addressLine="412 Oak St, Austin, TX"
        distanceMiles={4.2}
        homeSize="2,000-2,999 sqft"
        tasks={tasks}
        quotedPrices={{}}
        fullServiceLabel={null}
        photoUrls={{}}
        pets="No pets"
        notes={null}
        suppliesProvided={false}
        tidyProNote={null}
        quotedServicePrice={null}
        quotedCleanerPay={null}
      />
    )
  }
  if (v === 'job') {
    return (
      <TaskListView
        bookingId="b"
        customerName="Jordan Ellis"
        addressLabel="Home"
        scheduledDate={isoInDays(0)}
        scheduledTime="10:00"
        durationMinutes={90}
        pets={null}
        notes={null}
        suppliesProvided
        tasks={[
          { id: 'r1', task_name: 'Clean kitchen counters', task_category: 'Kitchen', task_icon: null, is_completed: false, completion_photo_url: null, before_photo_url: null },
        ]}
      />
    )
  }
  return (
    <ProMessageThreadView
      blocked={false}
      bookingId="b"
      customerName="Jordan Ellis"
      customerPhotoUrl={null}
      canCall={false}
      scheduledDate={isoInDays(2)}
      scheduledTime="10:00"
      startsAtMs={null}
      customerLocalTime={null}
      durationMinutes={90}
      distanceMiles={4.2}
      addressLabel="Home"
      addressLine="412 Oak St, Austin, TX"
      homeSize={v.startsWith('fs') ? '2,000-2,999 sqft' : '1,000-1,999 sqft'}
      tasks={v.startsWith('fs') ? ([] as never) : tasks}
      fullService={v.startsWith('fs') ? { selection: fsSelection, lines: fsLines } : null}
      photoUrls={{}}
      pets={null}
      notes={null}
      suppliesProvided={v !== 'request-no-supplies' && v !== 'fs-request-no-supplies'}
      payout={46.4}
      status="pending"
      cancelledNote={null}
      cancelledByMe={false}
      decisionStatus="pending"
      progressStatus={null}
      messages={[]}
      recurrence={null}
    />
  )
}
