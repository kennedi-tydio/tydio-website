import type { Tier } from '@/lib/pricingRules'
import type { LaundryService } from '@/lib/laundry'
import type { PetTaskDetails } from '@/lib/petTasks'

export type DirtLevel = 'light' | 'standard' | 'heavy'

export type LaundryLoads = {
  wash: number
  dry: number
  fold: number
}

export type TidyTask = {
  id: string
  name: string
  notes: string
  room: string
  dirtLevel: DirtLevel | null
  unusual: string[]
  completed: boolean
  hasDishwasher?: boolean | null
  // Legacy: one "Laundry" task with load counts for wash/dry/fold. Tasks saved
  // before laundry services were split still carry this and price as before.
  laundryLoads?: LaundryLoads | null
  // A laundry task is a single service with its own quantity.
  laundryService?: LaundryService | null
  // Wash/dry/fold: basket count in half-basket steps (0.5, 1, 1.5, ...).
  laundryBaskets?: number | null
  // Wash / dry / wash & dry: how many separate machine loads, a whole number
  // from 1. Kept apart from the basket count: one basket can be several loads
  // (whites, darks, delicates). Missing on tasks saved before this was asked.
  machineLoads?: number | null
  // Wash or Dry: the Dry (or Wash) task in the same list that's the same
  // laundry. Set on both tasks. Loads both washed and dried reserve the
  // full cycle of the visit (see visitDurationMinutes).
  sameLaundryAsTaskId?: string | null
  // Iron: number of items, a positive whole number.
  ironItems?: number | null
  // Wash / dry / wash & dry: whether the customer has a working washer and
  // dryer. False means the Tidy Pro takes the laundry to the nearest
  // laundromat. Missing on tasks saved before this was asked: treated as
  // home machines, as those bookings were made.
  hasWasherDryer?: boolean | null
  // Pet enclosure / litter box task: options, confirmed scope and the
  // photos that passed the AI check (see lib/petTasks.ts). The estimate
  // below was made from those photos.
  pet?: PetTaskDetails | null
  // Automatic pricing was down when this task was added (see
  // lib/taskQuotes.ts), so it has no estimate: the booking goes to the Tidy
  // Pro as a quote request instead of being charged up front. A pet task's
  // photos weren't checked either. Cleared once the Tidy Pro quotes it.
  needsQuote?: boolean | null
  // The Tidy Pro quoted this task (lib/quoteRequests.ts).
  quotedByTidyPro?: boolean | null
  // Their price for it, in dollars: what the customer pays for the task, before
  // any Top Tidy Pro / distance surcharge and the card fee. Charged as a fixed
  // price in place of the time-based one. Only ever set server-side.
  quotedPrice?: number | null
  tier?: Tier | null
  estimatedMinutes?: number | null
  // The customer said this task is for a different room from the same kind
  // of room in their Standard / Deep Cleaning (lib/fullServiceScope), so it
  // isn't a duplicate. Shown to the Tidy Pro.
  overlapAnswer?: 'different_room' | null
}
