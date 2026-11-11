'use client'

import { useState } from 'react'
import ModalShell from './ModalShell'

// Shown on every active-booking screen (on the way, arrived, cleaning) for
// both customers and Tidy Pros. Opens a sheet with one-tap Call 911 and
// Text 911. The text is prefilled with the booking address when we have it,
// since a dispatcher's first question is "where are you?".
export default function EmergencyButton({ addressLine }: { addressLine?: string | null }) {
  const [open, setOpen] = useState(false)

  const smsBody = addressLine ? `Emergency at ${addressLine}. ` : 'Emergency. '
  // iOS and Android both accept "?body=" on sms: links.
  const smsHref = `sms:911?body=${encodeURIComponent(smsBody)}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 px-3 rounded-full bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        <IconAlert />
        SOS
        <span className="sr-only">: call or text 911</span>
      </button>

      {open && (
        <ModalShell
          className="fixed inset-0 z-[60] flex items-end justify-center"
          panelClassName="w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl"
          onClose={() => setOpen(false)}
          labelledBy="emergency-title"
        >
          <h2 id="emergency-title" className="font-bold text-slate-900 text-lg mb-1">
            Emergency?
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            If you or anyone else is in danger, contact 911 now. You can report the issue to Tydio once you&apos;re safe.
          </p>

          {addressLine && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 mb-5">
              <p className="text-xs text-slate-400 mb-0.5">Booking address</p>
              <p className="text-sm font-semibold text-slate-900">{addressLine}</p>
            </div>
          )}

          <a
            href="tel:911"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-red-600 text-white font-bold text-base mb-3 hover:bg-red-700"
          >
            <IconPhone />
            Call 911
          </a>
          <a
            href={smsHref}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl border-2 border-red-600 text-red-700 font-bold text-base mb-2"
          >
            <IconText />
            Text 911
          </a>
          <p className="text-xs text-slate-400 text-center mb-5">
            Text-to-911 isn&apos;t available everywhere. Call if you can.
          </p>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm"
          >
            Cancel
          </button>
        </ModalShell>
      )}
    </>
  )
}

function IconAlert() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  )
}

function IconText() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
