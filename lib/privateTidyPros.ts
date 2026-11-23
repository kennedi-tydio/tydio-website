// Tidy Pro accounts that only certain customers can see: the founder's own Pro profiles,
// kept for testing the booking flow on the live site. Every other customer never finds
// them in search, as a replacement or extra Tidy Pro, or as a "now available" match, and
// can't open their profile or send them a booking or quote request.
//
// Tidy Pro profile id → the customer profile ids allowed to see it.
const PRIVATE_TIDY_PROS: Record<string, readonly string[]> = {
  // Kennedi Coats (kennedicoats773@gmail.com)
  '26c6fa0a-3fff-4d86-97b5-340400c8d93d': ['df53cdfe-4ccf-4e13-a52f-19af0727ea33'],
  // Kennedi (Test) Coats (rvrblossom@gmail.com)
  '853ac2a7-a148-4521-bf4a-b250319abc8e': ['df53cdfe-4ccf-4e13-a52f-19af0727ea33'],
}

// True when this customer can't see or book this Tidy Pro. With no customer (nobody to
// check against), a private Tidy Pro stays hidden.
export function isHiddenFromCustomer(tidyProId: string | null, customerId: string | null | undefined): boolean {
  if (!tidyProId) return false
  const allowed = PRIVATE_TIDY_PROS[tidyProId]
  if (!allowed) return false
  return !customerId || !allowed.includes(customerId)
}
