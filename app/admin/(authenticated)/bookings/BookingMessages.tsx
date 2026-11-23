'use client'

import { useState } from 'react'
import { getBookingMessagesAction, type AdminBookingMessage } from '../../actions'

// The customer and Tidy Pro's chat on one booking, read-only. It loads the first
// time the panel is opened, so the Bookings page doesn't fetch every thread.

function at(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

export default function BookingMessages({
  bookingId,
  customerName,
  tidyProName,
  timeZone,
}: {
  bookingId: string
  customerName: string
  tidyProName: string
  timeZone: string
}) {
  const [messages, setMessages] = useState<AdminBookingMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    const result = await getBookingMessagesAction(bookingId)
    if ('error' in result) setError(result.error)
    else setMessages(result.messages)
    setLoading(false)
  }

  return (
    <details
      className="group"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && messages == null && !loading) void load()
      }}
    >
      <summary className="cursor-pointer select-none text-xs font-semibold text-brand py-1 list-none [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">▸ Show messages{messages ? ` (${messages.length})` : ''}</span>
        <span className="hidden group-open:inline">▾ Hide messages{messages ? ` (${messages.length})` : ''}</span>
      </summary>
      <div className="mt-2 bg-slate-50 rounded-xl p-4 text-xs">
        {loading && <p className="text-slate-400">Loading messages…</p>}
        {error && (
          <p role="alert" className="text-red-600">
            Couldn&apos;t load messages: {error}{' '}
            <button type="button" onClick={() => void load()} className="underline">
              Try again
            </button>
          </p>
        )}
        {messages && messages.length === 0 && <p className="text-slate-500">No messages on this booking.</p>}
        {messages && messages.length > 0 && (
          <ol className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {messages.map((m) => {
              const fromCustomer = m.senderRole === 'USER'
              return (
                <li key={m.id} className={`flex flex-col max-w-[80%] ${fromCustomer ? 'self-start items-start' : 'self-end items-end'}`}>
                  <span className="text-[10px] text-slate-400 mb-0.5">
                    {fromCustomer ? `${customerName} (customer)` : `${tidyProName} (Tidy Pro)`} · {at(m.createdAt, timeZone)}
                  </span>
                  <div
                    className={`rounded-lg px-3 py-2 whitespace-pre-wrap break-words ${
                      fromCustomer ? 'bg-white border border-slate-200 text-slate-700' : 'bg-brand/10 border border-brand/20 text-slate-800'
                    }`}
                  >
                    {m.body}
                    {m.proposal && (
                      <div className="mt-1 text-slate-500">
                        Proposed {m.proposal.date} at {m.proposal.time.slice(0, 5)} · <span className="capitalize">{m.proposal.status}</span>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </details>
  )
}
