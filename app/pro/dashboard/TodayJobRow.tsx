'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { markOnTheWayAction } from '@/app/pro/messages/[bookingId]/actions'
import type { TodayJob } from './DashboardHome'

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

export default function TodayJobRow({ job, timeRangeLabel }: { job: TodayJob; timeRangeLabel: string }) {
  const router = useRouter()
  const [working, setWorking] = useState(false)

  if (!job.isActive) {
    return (
      <Link href={`/pro/bookings/${job.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Today</p>
          <p className="text-xs text-slate-400 mb-1">{timeRangeLabel}</p>
          <p className="text-sm font-semibold text-slate-900 truncate">{job.customerName}</p>
          {job.address && <p className="text-xs text-slate-400 truncate">{job.address}</p>}
        </div>
        <IconChevronRight />
      </Link>
    )
  }

  async function handleTap() {
    if (working) return
    if (job.progressStatus == null) {
      setWorking(true)
      const result = await markOnTheWayAction(job.id)
      setWorking(false)
      if ('error' in result) return
    }
    router.push(`/pro/bookings/${job.id}`)
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={working}
      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left disabled:opacity-60"
      style={{ backgroundColor: '#e8f9fa' }}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--color-brand)' }}>
          Now
        </p>
        <p className="text-xs text-slate-400 mb-1">{timeRangeLabel}</p>
        <p className="text-sm font-semibold text-slate-900 truncate">{job.customerName}</p>
        {job.address && <p className="text-xs text-slate-400 truncate">{job.address}</p>}
      </div>
      <IconChevronRight />
    </button>
  )
}
