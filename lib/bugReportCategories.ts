// What people pick from on Profile → Report a bug. `audience` decides who sees it:
// customer-only and Tidy Pro-only topics are hidden from the other side.
export type BugReportAudience = 'everyone' | 'customer' | 'tidyPro'
export type BugReportRole = 'USER' | 'TIDYPRO'
export type BugReportCategory = { id: string; label: string; audience: BugReportAudience }

export const BUG_REPORT_DETAILS_MAX_LENGTH = 2000

export const BUG_REPORT_CATEGORIES: readonly BugReportCategory[] = [
  { id: 'auth', label: 'Sign-up, login, or verification', audience: 'everyone' },
  { id: 'address', label: 'Address or service area', audience: 'everyone' },
  { id: 'services', label: 'Selecting services or cleaning tasks', audience: 'everyone' },
  { id: 'photos', label: 'Uploading or viewing photos', audience: 'everyone' },
  { id: 'pricing', label: 'Pricing or quotes', audience: 'everyone' },
  { id: 'booking', label: 'Booking, scheduling, or rescheduling', audience: 'everyone' },
  { id: 'messages', label: 'Messages or notifications', audience: 'everyone' },
  { id: 'reviews', label: 'Reviews or ratings', audience: 'everyone' },
  { id: 'checkout', label: 'Checkout, charges, or refunds', audience: 'customer' },
  { id: 'pro_settings', label: 'Profile, availability, or rate settings', audience: 'tidyPro' },
  { id: 'onboarding', label: 'Onboarding or background check', audience: 'tidyPro' },
  { id: 'earnings', label: 'Earnings, tips, or payouts', audience: 'tidyPro' },
  { id: 'app_stability', label: 'App freezes, crashes, or won’t load', audience: 'everyone' },
  { id: 'other', label: 'Something else', audience: 'everyone' },
]

export function bugReportCategoriesFor(role: BugReportRole): BugReportCategory[] {
  const own: BugReportAudience = role === 'USER' ? 'customer' : 'tidyPro'
  return BUG_REPORT_CATEGORIES.filter((c) => c.audience === 'everyone' || c.audience === own)
}
