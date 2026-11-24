// The size buckets a customer picks for each saved address. Values match the
// user_addresses.square_footage check constraint (migration 033).
export const SQUARE_FOOTAGE_OPTIONS = [
  { value: 'under_1000', label: 'Under 1,000 sqft' },
  { value: '1000_1999', label: '1,000-1,999 sqft' },
  { value: '2000_2999', label: '2,000-2,999 sqft' },
  { value: '3000_plus', label: '3,000+ sqft' },
] as const

export type SquareFootage = (typeof SQUARE_FOOTAGE_OPTIONS)[number]['value']

export function isSquareFootage(value: unknown): value is SquareFootage {
  return SQUARE_FOOTAGE_OPTIONS.some((o) => o.value === value)
}

// The home size a booking was priced with: on its Standard / Deep Cleaning
// snapshot, or on its task pricing breakdown. null for bookings that kept neither.
export function bookedSquareFootage(fullService: unknown, pricingBreakdown: unknown): SquareFootage | null {
  for (const raw of [fullService, pricingBreakdown]) {
    const value = raw && typeof raw === 'object' ? (raw as { square_footage?: unknown }).square_footage : null
    if (isSquareFootage(value)) return value
  }
  return null
}

export function squareFootageLabel(value: string | null | undefined): string | null {
  return SQUARE_FOOTAGE_OPTIONS.find((o) => o.value === value)?.label ?? null
}
