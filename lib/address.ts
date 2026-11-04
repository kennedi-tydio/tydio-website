// Saved addresses are stored as "street, city, state, zip" (see addressLine in
// SchedulePicker) — a past booking only shows the city and state.
export function cityAndState(addressLine: string | null): string | null {
  if (!addressLine) return null
  const parts = addressLine.split(', ')
  return parts.length >= 3 ? `${parts[parts.length - 3]}, ${parts[parts.length - 2]}` : addressLine
}
