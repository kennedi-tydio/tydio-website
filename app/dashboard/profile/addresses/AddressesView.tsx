'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { deleteAddressAction, updateAddressSquareFootageAction, type SavedAddress } from './actions'
import AddressForm from './AddressForm'
import SquareFootageSelect from '@/app/components/form/SquareFootageSelect'
import { squareFootageLabel, type SquareFootage } from '@/lib/squareFootage'

function addressLine(a: SavedAddress): string {
  const street = a.unit_number ? `${a.street_address} ${a.unit_number}` : a.street_address
  return `${street}, ${a.city}, ${a.state} ${a.zip_code}`
}

export default function AddressesView({ initialAddresses }: { initialAddresses: SavedAddress[] }) {
  const [addresses, setAddresses] = useState(initialAddresses)
  const [showForm, setShowForm] = useState(false)
  const [sqftError, setSqftError] = useState<string | null>(null)
  const [savingSqft, startSqftTransition] = useTransition()
  const [, startTransition] = useTransition()

  // Addresses saved before square footage was required get it filled in here.
  function handleSquareFootage(id: string, value: SquareFootage) {
    startSqftTransition(async () => {
      const result = await updateAddressSquareFootageAction(id, value)
      if ('error' in result) {
        setSqftError(result.error)
        return
      }
      setSqftError(null)
      setAddresses((prev) => prev.map((a) => (a.id === id ? result : a)))
    })
  }

  function handleDelete(id: string) {
    setAddresses((prev) => prev.filter((a) => a.id !== id))
    startTransition(() => {
      deleteAddressAction(id)
    })
  }

  function handleSaved(address: SavedAddress) {
    setAddresses((prev) => [...prev, address])
    setShowForm(false)
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href="/dashboard/profile" className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Profile
        </Link>

        <h1 className="text-2xl font-bold text-slate-900 mb-6">Manage Addresses</h1>

        {addresses.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm mb-6">
            <p className="font-semibold text-slate-900 mb-1">No saved addresses</p>
            <p className="text-sm text-slate-400">Add an address to use it when booking.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden mb-6">
            {addresses.map((a) => (
              <div key={a.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {a.label}
                      {a.is_default && <span className="text-xs font-normal text-slate-400"> · Default</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{addressLine(a)}</p>
                    {a.square_footage && (
                      <p className="text-xs text-slate-400 mt-0.5">{squareFootageLabel(a.square_footage)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    aria-label={`Remove ${a.label}`}
                    className="text-slate-300 hover:text-red-500 flex-shrink-0"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
                {!a.square_footage && (
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-xs font-medium text-amber-700">
                      Add the square footage to book cleanings at this address.
                    </p>
                    <SquareFootageSelect value={null} onChange={(v) => handleSquareFootage(a.id, v)} disabled={savingSqft} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {sqftError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
            {sqftError}
          </p>
        )}

        <button
          onClick={() => setShowForm(true)}
          className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide"
          style={{ backgroundColor: '#1a2332' }}
        >
          + Add Address
        </button>
      </div>

      {showForm && <AddressForm onSaved={handleSaved} onClose={() => setShowForm(false)} />}
    </main>
  )
}
