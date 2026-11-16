'use client'

import { reportTidyProAction } from './actions'
import ReportSheet from '@/app/components/ReportSheet'
import { TIDY_PRO_REPORT_CATEGORIES } from '@/lib/reportCategories'

export default function ReportTidyProSheet({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  return (
    <ReportSheet
      title="Report Tidy Pro"
      categories={TIDY_PRO_REPORT_CATEGORIES}
      onSubmit={(categoryId, reasonId, details) => reportTidyProAction(bookingId, categoryId, reasonId, details)}
      onClose={onClose}
    />
  )
}
