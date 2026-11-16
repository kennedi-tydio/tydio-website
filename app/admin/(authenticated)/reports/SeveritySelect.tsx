'use client'

import { useRef } from 'react'
import { REPORT_SEVERITIES, SEVERITY_LABELS, type ReportSeverity } from '@/lib/reportCategories'

const TONE: Record<ReportSeverity, string> = {
  low: 'bg-slate-50 text-slate-600 border-slate-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
}

// The report's level, changed in place: picking one saves it straight away.
export default function SeveritySelect({ action, severity, label }: { action: (formData: FormData) => Promise<void>; severity: ReportSeverity; label: string }) {
  const form = useRef<HTMLFormElement>(null)
  return (
    <form ref={form} action={action}>
      <select
        name="severity"
        defaultValue={severity}
        aria-label={`Level of ${label}`}
        onChange={() => form.current?.requestSubmit()}
        className={`text-xs font-semibold border rounded-lg px-2 py-1 ${TONE[severity]}`}
      >
        {REPORT_SEVERITIES.map((level) => (
          <option key={level} value={level}>
            {SEVERITY_LABELS[level]}
          </option>
        ))}
      </select>
    </form>
  )
}
