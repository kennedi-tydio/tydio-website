'use client'

import { blockTidyProAction, reportTidyProAction } from './actions'
import ReportSheet from '@/app/components/ReportSheet'
import { TIDY_PRO_REPORT_CATEGORIES } from '@/lib/reportCategories'
import { NO_SHOW_REPORT_AFTER_MINUTES } from '@/lib/bookingTime'

// noShowReportableAtMs: when "Cleaner didn't show up" can be reported (see
// noShowReportableAt). Before then, choosing it shows a countdown instead.
export default function ReportTidyProSheet({
  bookingId,
  noShowReportableAtMs = null,
  onClose,
}: {
  bookingId: string
  noShowReportableAtMs?: number | null
  onClose: () => void
}) {
  return (
    <ReportSheet
      title="Report Tidy Pro"
      categories={TIDY_PRO_REPORT_CATEGORIES}
      onSubmit={(categoryId, reasonId, details) => reportTidyProAction(bookingId, categoryId, reasonId, details)}
      onClose={onClose}
      block={{
        label: 'Tidy Pro',
        consequence: 'You won’t be able to message each other, and they won’t show up when you book.',
        onBlock: () => blockTidyProAction(bookingId),
      }}
      waits={
        noShowReportableAtMs != null
          ? [
              {
                reasonId: 'no_show',
                availableAtMs: noShowReportableAtMs,
                message: `A no-show can be reported ${NO_SHOW_REPORT_AFTER_MINUTES} minutes after the start time, in case your Tidy Pro is running a little late. You can message or call them in the meantime.`,
              },
            ]
          : []
      }
    />
  )
}
