import { NOTIFICATIONS_REQUIRED, NOTIFICATION_STEP_LABEL, meetsNotificationRequirement } from '@/lib/pushRequirement'
import { hasChosenServices } from '@/lib/tidyProServices'

// What a cleaner has to finish themself before customers can book them, on top of
// being approved. Checked live rather than stored, so a step that's later undone
// (removing a bio, say) takes them back out of search straight away.
type OnboardingFields = {
  profile_photo_url: string | null
  bio: string | null
  availability: unknown
  stripe_onboarding_completed: boolean
  travel_radius_miles: number | null
  services_provided: string[] | null
  latitude: number | null
  longitude: number | null
  // Whether any device has a push subscription (see withPushStatus in lib/pushRequirement).
  has_push: boolean
  // Texts opted in with a phone number; only counts while NOTIFICATION_REQUIREMENT allows it.
  has_sms?: boolean
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
  if (!hasChosenServices(cleaner.services_provided)) steps.push({ label: 'Choose the services you provide', href: '/pro/profile/services' })
  if (NOTIFICATIONS_REQUIRED && !meetsNotificationRequirement(cleaner)) steps.push({ label: NOTIFICATION_STEP_LABEL, href: '/pro/profile/notifications?required=1' })
  return steps
}

// A required step for anyone who offers Standard or Deep Cleaning but hasn't
// priced it (lib/fullServiceRates unpricedFullServices), including Tidy Pros who
// finished onboarding before these services had prices. It's kept out of
// missingOnboardingSteps on purpose: that list decides whether they can be
// booked at all, and an unpriced service only keeps them out of full-service
// bookings (see canPerform in lib/fullServiceRates). Unticking the service on
// Services Provided clears it too.
export const FULL_SERVICE_PRICING_STEP_LABEL = 'Set your Standard & Deep Cleaning prices'
export const FULL_SERVICE_PRICING_HREF = '/pro/profile/services/pricing'

export function fullServicePricingSteps(
  unpriced: readonly ('standard' | 'deep')[]
): { label: string; href: string; fullServiceOnly: true }[] {
  if (unpriced.length === 0) return []
  const label =
    unpriced.length === 2
      ? FULL_SERVICE_PRICING_STEP_LABEL
      : unpriced[0] === 'deep'
        ? 'Set your Deep Cleaning prices'
        : 'Set your Standard Cleaning prices'
  return [{ label, href: FULL_SERVICE_PRICING_HREF, fullServiceOnly: true }]
}

// missingOnboardingSteps talks to the cleaner ("Write your bio"); admin lists read
// better without the "your".
export function adminStepLabel(label: string): string {
  return label.replace(/\byour\b /i, '')
}
