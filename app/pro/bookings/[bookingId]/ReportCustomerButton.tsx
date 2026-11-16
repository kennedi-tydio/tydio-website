'use client'

import { useState } from 'react'
import ReportSheet from '@/app/components/ReportSheet'
import { CUSTOMER_REPORT_CATEGORIES } from '@/lib/reportCategories'
import { reportCustomerAction } from './actions'

function IconFlag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 22V4" />
      <path d="M4 4h13l-2.5 4L17 12H4" />
    </svg>
  )
}

// The flag in a Tidy Pro's booking header: opens the sheet for reporting the customer.
export default function ReportCustomerButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Report customer" className="w-8 h-8 flex items-center justify-center">
        <IconFlag />
      </button>
      {open && (
        <ReportSheet
          title="Report customer"
          categories={CUSTOMER_REPORT_CATEGORIES}
          onSubmit={(categoryId, reasonId, details) => reportCustomerAction(bookingId, categoryId, reasonId, details)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
