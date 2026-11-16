// What people pick from when reporting a booking: a category, then a reason within it,
// then (optionally) the details. Customers report their Tidy Pro; Tidy Pros report the
// customer. The ids are what's saved with the report; the labels are what's shown.
// A category with no reasons ("Something else") asks them to describe what happened.

// How serious a report is, which decides how many of them lead to a ban (see
// BAN_THRESHOLDS). Saved on the report's risk event; the admin can change it.
export const REPORT_SEVERITIES = ['low', 'medium', 'high'] as const
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number]

export const SEVERITY_LABELS: Record<ReportSeverity, string> = { low: 'Low', medium: 'Mid', high: 'High' }

export type ReportReason = { id: string; label: string; severity: ReportSeverity }
// `severity` on a category is for one with no reasons ("Something else"); the admin
// sets the real level once they've read what happened.
export type ReportCategory = { id: string; label: string; reasons: readonly ReportReason[]; severity?: ReportSeverity }

// Shown to customers reporting their Tidy Pro.
export const TIDY_PRO_REPORT_CATEGORIES: readonly ReportCategory[] = [
  {
    id: 'arrival_attendance',
    label: 'Arrival or attendance',
    reasons: [
      { id: 'late', label: 'Cleaner is late', severity: 'low' },
      { id: 'no_show', label: 'Cleaner didn’t show up', severity: 'medium' },
      { id: 'different_person', label: 'A different person arrived', severity: 'high' },
    ],
  },
  {
    id: 'task_quality',
    label: 'Task quality or completion',
    reasons: [
      { id: 'task_skipped', label: 'A task was skipped or unfinished', severity: 'low' },
      { id: 'quality_issue', label: 'Cleaning quality issue', severity: 'low' },
      { id: 'completed_early', label: 'Cleaner marked the job complete before finishing', severity: 'medium' },
    ],
  },
  {
    id: 'damage_missing',
    label: 'Damage or missing items',
    reasons: [
      { id: 'damaged', label: 'Something was damaged', severity: 'medium' },
      { id: 'missing_item', label: 'An item is missing', severity: 'high' },
    ],
  },
  {
    id: 'safety_behavior',
    label: 'Safety or behavior',
    reasons: [
      { id: 'felt_unsafe', label: 'I felt unsafe', severity: 'high' },
      { id: 'harassment_discrimination', label: 'Harassment or discrimination', severity: 'high' },
      { id: 'inappropriate_behavior', label: 'Inappropriate behavior', severity: 'medium' },
    ],
  },
  {
    id: 'payment_refund',
    label: 'Payment or refund',
    reasons: [
      { id: 'incorrect_charge', label: 'Incorrect or unexpected charge', severity: 'low' },
      { id: 'refund_issue', label: 'Refund issue', severity: 'low' },
      { id: 'off_platform_payment', label: 'Cleaner asked me to pay outside Tydio', severity: 'medium' },
    ],
  },
  { id: 'other', label: 'Something else', reasons: [], severity: 'low' },
]

// Shown to Tidy Pros reporting the customer.
export const CUSTOMER_REPORT_CATEGORIES: readonly ReportCategory[] = [
  {
    id: 'access_availability',
    label: 'Access or customer availability',
    reasons: [
      { id: 'customer_unresponsive', label: 'Customer isn’t responding', severity: 'low' },
      { id: 'cannot_enter', label: 'I can’t enter the property', severity: 'low' },
      { id: 'incorrect_entry_info', label: 'Address or entry instructions are incorrect', severity: 'low' },
    ],
  },
  {
    id: 'task_conditions',
    label: 'Task or working conditions',
    reasons: [
      { id: 'task_differs', label: 'Task differs from the booking', severity: 'low' },
      { id: 'extra_work_requested', label: 'Customer requested extra work', severity: 'low' },
      { id: 'supplies_unavailable', label: 'Required supplies or equipment are unavailable', severity: 'low' },
    ],
  },
  {
    id: 'safety_behavior',
    label: 'Safety or behavior',
    reasons: [
      { id: 'felt_unsafe', label: 'I felt unsafe', severity: 'high' },
      { id: 'harassment_discrimination', label: 'Harassment or discrimination', severity: 'high' },
      { id: 'unsafe_pet', label: 'Aggressive or unsecured pet', severity: 'medium' },
      { id: 'hazardous_conditions', label: 'Hazardous conditions', severity: 'medium' },
    ],
  },
  {
    id: 'damage_injury',
    label: 'Damage or injury',
    reasons: [
      { id: 'property_damaged', label: 'Property was damaged during the job', severity: 'low' },
      { id: 'injured', label: 'I was injured', severity: 'medium' },
    ],
  },
  {
    id: 'payout_payment',
    label: 'Payout or payment',
    reasons: [
      { id: 'payout_issue', label: 'Missing or incorrect payout', severity: 'low' },
      { id: 'tip_issue', label: 'Tip issue', severity: 'low' },
      { id: 'off_platform_payment', label: 'Customer asked to pay outside Tydio', severity: 'medium' },
    ],
  },
  { id: 'other', label: 'Something else', reasons: [], severity: 'low' },
]

export type ReportChoice = { category: ReportCategory; reason: ReportReason | null }

// The category and reason a report was filed under, or null if they don't fit together.
// A category with reasons needs one of them; "Something else" takes none.
export function findReportChoice(categories: readonly ReportCategory[], categoryId: unknown, reasonId: unknown): ReportChoice | null {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return null
  if (category.reasons.length === 0) return { category, reason: null }
  const reason = category.reasons.find((r) => r.id === reasonId)
  return reason ? { category, reason } : null
}

export function reportSeverity(choice: ReportChoice): ReportSeverity {
  return choice.reason?.severity ?? choice.category.severity ?? 'low'
}

// Details are optional once a reason says what happened; "Something else" needs them.
export function reportNeedsDetails(choice: ReportChoice): boolean {
  return choice.reason == null
}

export function reportChoiceLabel(choice: ReportChoice): string {
  return choice.reason ? `${choice.category.label}: ${choice.reason.label}` : choice.category.label
}

// The text saved on the report's risk event, which the admin reads in the incident history.
export function reportDescription(choice: ReportChoice, details: string): string {
  const label = reportChoiceLabel(choice)
  return details ? `${label} — ${details}` : label
}

export type ReportInputResult = { choice: ReportChoice; details: string } | { error: string }

// Server-side check of what a report sheet sent.
export function parseReportInput(categories: readonly ReportCategory[], categoryId: unknown, reasonId: unknown, details: unknown): ReportInputResult {
  if (!categories.some((c) => c.id === categoryId)) return { error: 'Please choose what the issue is about.' }
  const choice = findReportChoice(categories, categoryId, reasonId)
  if (!choice) return { error: 'Please choose what happened.' }
  const trimmed = typeof details === 'string' ? details.trim() : ''
  if (!trimmed && reportNeedsDetails(choice)) return { error: 'Please describe what happened.' }
  return { choice, details: trimmed }
}

// risk_events.severity also allows 'critical', from other kinds of event; it counts as high.
export function normalizeSeverity(value: unknown): ReportSeverity {
  if (value === 'critical') return 'high'
  return REPORT_SEVERITIES.includes(value as ReportSeverity) ? (value as ReportSeverity) : 'low'
}

// 3 low, 2 mid, or 1 high-level report leads to an account ban. Each level counts on
// its own: 2 low and 1 mid doesn't reach it.
export const BAN_THRESHOLDS: Record<ReportSeverity, number> = { low: 3, medium: 2, high: 1 }

export type SeverityCounts = Record<ReportSeverity, number>

export function countBySeverity(severities: readonly unknown[]): SeverityCounts {
  const counts: SeverityCounts = { low: 0, medium: 0, high: 0 }
  for (const s of severities) counts[normalizeSeverity(s)]++
  return counts
}

export function reachesBanThreshold(counts: SeverityCounts): boolean {
  return REPORT_SEVERITIES.some((level) => counts[level] >= BAN_THRESHOLDS[level])
}
