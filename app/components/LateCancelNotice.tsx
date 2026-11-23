'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { DEFAULT_BOOKING_TIME_ZONE, LATE_CANCEL_WINDOW_HOURS, isLateCancellation, isValidTimeZone } from '@/lib/bookingTime'

// Rechecked this often, so a page left open shows the notice once the start time is close.
const RECHECK_MS = 30_000

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, RECHECK_MS)
  return () => clearInterval(id)
}

// True when a booking at this date and time (in the customer's own zone, as booked) starts
// within the late-cancel window. False on the server, so the notice only appears once the
// page has loaded and can read the clock.
export function useStartsWithinLateCancelWindow(date: string | null, time: string | null): boolean {
  const getSnapshot = useCallback(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isLateCancellation(date, time, new Date(), isValidTimeZone(zone) ? zone : DEFAULT_BOOKING_TIME_ZONE)
  }, [date, time])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

// Shown before a customer pays for a booking that starts within the late-cancel window:
// once it's accepted, canceling only refunds half (lateCancelRefund).
export default function LateCancelNotice({ refund, className = '' }: { refund: number; className?: string }) {
  return (
    <div role="status" className={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-relaxed ${className}`}>
      <p className="font-semibold">Your booking starts in less than {LATE_CANCEL_WINDOW_HOURS} hours.</p>
      <p>
        That&apos;s inside the {LATE_CANCEL_WINDOW_HOURS}-hour cancellation window, so once it&apos;s accepted, canceling refunds only 50%
        (${refund.toFixed(2)}).
      </p>
    </div>
  )
}
