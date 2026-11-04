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

export function squareFootageLabel(value: string | null | undefined): string | null {
  return SQUARE_FOOTAGE_OPTIONS.find((o) => o.value === value)?.label ?? null
}
