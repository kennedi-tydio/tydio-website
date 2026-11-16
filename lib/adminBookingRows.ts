// A request sent to several Tidy Pros is one booking row per Tidy Pro, all sharing a
// request_group_id, plus the customer's own booking (the group's original or primary).
// Admin lists of closed bookings show each request once: the customer's booking, or,
// if that row isn't in the list, the first copy from the group.

type Row = { id: string; request_group_id: string | null }
type Group = { id: string; original_booking_id: string | null; primary_booking_id: string | null }

export function oneRowPerRequest<T extends Row>(rows: readonly T[], groups: readonly Group[]): T[] {
  const customerBookingOf = new Map(groups.map((g) => [g.id, g.original_booking_id ?? g.primary_booking_id]))
  const ids = new Set(rows.map((r) => r.id))
  const seenGroups = new Set<string>()
  return rows.filter((r) => {
    const groupId = r.request_group_id
    if (!groupId) return true
    const customerBooking = customerBookingOf.get(groupId)
    // The customer's booking is listed on its own, so the copies add nothing.
    if (customerBooking && customerBooking !== r.id && ids.has(customerBooking)) return false
    if (seenGroups.has(groupId)) return false
    seenGroups.add(groupId)
    return true
  })
}

// How many Tidy Pros each request went to, by the id of the row kept for it.
export function prosAskedByRow(rows: readonly Row[], kept: readonly Row[], groups: readonly Group[]): Map<string, number> {
  const customerBookingOf = new Map(groups.map((g) => [g.id, g.original_booking_id ?? g.primary_booking_id]))
  const groupOfRow = new Map<string, string>()
  for (const r of rows) {
    if (!r.request_group_id) continue
    groupOfRow.set(r.id, r.request_group_id)
    const customerBooking = customerBookingOf.get(r.request_group_id)
    if (customerBooking) groupOfRow.set(customerBooking, r.request_group_id)
  }
  const perGroup = new Map<string, Set<string>>()
  for (const r of rows) {
    const groupId = groupOfRow.get(r.id)
    if (!groupId) continue
    perGroup.set(groupId, (perGroup.get(groupId) ?? new Set()).add(r.id))
  }
  return new Map(kept.map((r) => [r.id, perGroup.get(groupOfRow.get(r.id) ?? '')?.size ?? 1]))
}
