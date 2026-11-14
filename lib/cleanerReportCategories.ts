// What a customer picks from when reporting their Tidy Pro, before describing what
// happened. The id is what's saved with the report; the label and examples are shown.
export const CLEANER_REPORT_CATEGORIES = [
  { id: 'cleaning_quality', label: 'Cleaning quality or incomplete service', examples: 'Missed areas, booked services left unfinished' },
  { id: 'late_or_no_show', label: 'Late arrival or no-show', examples: 'Arrived late, never arrived' },
  { id: 'unprofessional', label: 'Unprofessional behavior', examples: 'Rude communication, inappropriate conduct' },
  { id: 'harassment_safety', label: 'Harassment, discrimination, or safety concern', examples: 'Threats, unwanted sexual behavior, discriminatory comments, unsafe actions' },
  { id: 'property_damage', label: 'Property damage', examples: 'Broken items, damaged furniture or surfaces' },
  { id: 'missing_items', label: 'Missing items or suspected theft', examples: 'Items missing after the visit' },
  { id: 'identity_concern', label: 'Identity or unauthorized person concern', examples: "Person didn't match the profile, brought an unapproved person" },
  { id: 'payment_off_platform', label: 'Payment or off-platform request', examples: 'Requested cash, unexpected charges, pressure to pay outside Tydio' },
  { id: 'privacy_access', label: 'Privacy or unauthorized access', examples: 'Took unauthorized photos, shared information, entered areas without permission' },
  { id: 'other', label: 'Other', examples: 'Anything not covered above' },
] as const

export type CleanerReportCategory = (typeof CLEANER_REPORT_CATEGORIES)[number]

export function findCleanerReportCategory(id: unknown): CleanerReportCategory | null {
  return CLEANER_REPORT_CATEGORIES.find((c) => c.id === id) ?? null
}
