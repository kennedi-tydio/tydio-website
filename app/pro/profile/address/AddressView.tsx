'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { removeAddressAction, type SavedAddress } from './actions'
import AddressForm from './AddressForm'

function addressLine(a: SavedAddress): string {
  return `${a.street_address}, ${a.city}, ${a.state} ${a.zip_code}`
}

export default function AddressView({ initialAddress }: { initialAddress: SavedAddress | null }) {
  const [address, setAddress] = useState(initialAddress)
  const [showForm, setShowForm] = useState(false)
  const [, startTransition] = useTransition()

  function handleRemove() {
    setAddress(null)
    startTransition(() => {
      removeAddressAction()
    })
  }

  function handleSaved(saved: SavedAddress) {
    setAddress(saved)
    setShowForm(false)
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href="/pro/profile" className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Profile
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-6">Manage Address</h1>

        {!address ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm mb-6">
            <p className="font-semibold text-slate-900 mb-1">No address added</p>
            <p className="text-sm text-slate-400">Add your address so customers know where you&apos;re based.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-6">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <p className="text-sm font-semibold text-slate-900 truncate">{addressLine(address)}</p>
              <button
                onClick={handleRemove}
                aria-label="Remove address"
                className="text-slate-300 hover:text-red-500 flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {!address && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide"
            style={{ backgroundColor: '#1a2332' }}
          >
            + Add Address
          </button>
        )}
      </div>

      {showForm && <AddressForm onSaved={handleSaved} onClose={() => setShowForm(false)} />}
    </main>
  )
}
