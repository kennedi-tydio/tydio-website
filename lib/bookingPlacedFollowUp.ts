import type { createAdminClient } from '@/lib/supabase/admin'
import type { TidyTask } from '@/app/dashboard/types'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { FullServiceSelection } from '@/lib/fullService'
import { makeDefaultIfNone } from '@/lib/defaultPaymentMethod'
import { emailAdminNewBooking } from '@/lib/newBookingAdminEmail'
import { isRecurrenceFrequency, startRecurringSeries } from '@/lib/recurringBookings'

type Admin = ReturnType<typeof createAdminClient>

// What happens once a customer's booking has been charged and sent (placeBooking),
// whether they confirmed it on the review page or approved and paid a Tidy Pro's
// quote (lib/quoteRequests.ts). Each step is best effort: the booking already exists.
export async function followUpPlacedBooking(
  admin: Admin,
  input: {
    customerId: string
    bookingId: string
    tidyProId: string
    tidyProName: string
    paymentMethodId: string
    recurrenceFrequency: string | null
    date: string
    time: string
    timeZone: string
    location: ScheduledLocation
    taskList: TidyTask[]
    fullService: FullServiceSelection | null
    notes: string | null
    entryInstructions: string | null
    suppliesProvided: boolean
    // Also save this booking's entry instructions on the address, for next time.
    saveEntryInstructionsToAddress: boolean
  }
): Promise<{ startedSeries: boolean; savedEntryInstructions: boolean }> {
  await makeDefaultIfNone(admin, input.customerId, input.paymentMethodId)

  const recurrence = isRecurrenceFrequency(input.recurrenceFrequency) ? input.recurrenceFrequency : null

  await emailAdminNewBooking(admin, input.bookingId, { recurrence }).catch((err) =>
    console.error('[Tydio] New booking admin email failed:', err)
  )

  // The first visit is booked; the series books each next one (see lib/recurringBookings).
  if (recurrence) {
    await startRecurringSeries(admin, {
      customerId: input.customerId,
      tidyProId: input.tidyProId,
      tidyProName: input.tidyProName,
      frequency: recurrence,
      firstDate: input.date,
      time: input.time,
      timeZone: input.timeZone,
      location: input.location,
      taskList: input.taskList,
      fullService: input.fullService,
      notes: input.notes,
      entryInstructions: input.entryInstructions,
      suppliesProvided: input.suppliesProvided,
      paymentMethodId: input.paymentMethodId,
      firstBookingId: input.bookingId,
    }).catch((err) => console.error('[Tydio] Starting recurring booking failed:', err))
  }

  let savedEntryInstructions = false
  if (input.saveEntryInstructionsToAddress && input.location.type === 'address') {
    await admin
      .from('user_addresses')
      .update({ entry_instructions: input.entryInstructions, updated_at: new Date().toISOString() })
      .eq('id', input.location.addressId)
      .eq('user_id', input.customerId)
    savedEntryInstructions = true
  }

  return { startedSeries: recurrence != null, savedEntryInstructions }
}
