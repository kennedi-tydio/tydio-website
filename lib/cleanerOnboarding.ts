// What a cleaner has to finish themself before customers can book them, on top of
// being approved. Checked live rather than stored, so a step that's later undone
// (removing a bio, say) takes them back out of search straight away.
type OnboardingFields = {
  profile_photo_url: string | null
  bio: string | null
  availability: unknown
  stripe_onboarding_completed: boolean
  travel_radius_miles: number | null
  latitude: number | null
  longitude: number | null
}

export function hasAvailability(availability: unknown): boolean {
  if (!availability || typeof availability !== 'object') return false
  return Object.values(availability).some((ranges) => Array.isArray(ranges) && ranges.length > 0)
}

export function missingOnboardingSteps(cleaner: OnboardingFields): { label: string; href: string }[] {
  const steps: { label: string; href: string }[] = []
  if (!cleaner.stripe_onboarding_completed) steps.push({ label: 'Set up your payout method', href: '/pro/profile/payouts' })
  if (!hasAvailability(cleaner.availability)) steps.push({ label: 'Choose your availability', href: '/pro/profile/availability' })
  if (!cleaner.profile_photo_url) steps.push({ label: 'Add a profile picture', href: '/pro/profile/edit' })
  if (!cleaner.bio?.trim()) steps.push({ label: 'Write your bio', href: '/pro/profile/edit' })
  // Matching measures the distance to each request from these, so without them
  // the cleaner is never shown, even with a street address saved.
  if (cleaner.latitude == null || cleaner.longitude == null) steps.push({ label: 'Add your address', href: '/pro/profile/address' })
  if (cleaner.travel_radius_miles == null) steps.push({ label: 'Set your travel distance', href: '/pro/profile/travel-distance' })
  return steps
}
