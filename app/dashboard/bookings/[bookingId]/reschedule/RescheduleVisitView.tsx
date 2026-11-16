'use client'

import { useRouter } from '@/app/components/NavigationSpinner'
import { TimePicker, type BusyRange } from '@/app/book/schedule/[cleanerId]/time/ChooseTimeView'
import type { WeeklyAvailability } from '@/lib/cleanerMatching'
import type { TimeOffRange } from '@/lib/timeOff'
import { checkVisitTimeAction } from './actions'

export default function RescheduleVisitView({
  bookingId,
  cleanerFirstName,
  ...picker
}: {
  bookingId: string
  cleanerFirstName: string
  availability: WeeklyAvailability
  timeOff: TimeOffRange[]
  busyByDate: Record<string, BusyRange[]>
  durationMinutes: number
  initialTime: string | null
  dateRange: { start: string; end: string }
}) {
  const router = useRouter()
  return (
    <TimePicker
      {...picker}
      initialDate={null}
      timeWindow={null}
      title="Choose a new date"
      intro={`Times ${cleanerFirstName} is free in the next month. You'll pay on the next screen.`}
      confirmLabel="Continue to payment"
      onConfirm={async (date, time) => {
        const problem = await checkVisitTimeAction(bookingId, date, time)
        if (problem) return problem
        router.push(`/dashboard/bookings/${bookingId}?date=${date}&time=${time}`)
        return null
      }}
    />
  )
}
