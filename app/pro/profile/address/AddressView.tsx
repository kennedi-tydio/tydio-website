'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { removeAddressAction, type SavedAddress } from './actions'
import AddressForm from './AddressForm'
import ModalShell from '@/app/components/ModalShell'

function addressLine(a: SavedAddress): string {
  return `${[a.street_address, a.unit_number].filter(Boolean).join(' ')}, ${a.city}, ${a.state} ${a.zip_code}`
}

export default function AddressView({
  initialAddress,
  returnHref,
}: {
  initialAddress: SavedAddress | null
  returnHref: string
}) {
  const router = useRouter()
  const [address, setAddress] = useState(initialAddress)
  const [showForm, setShowForm] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  function closeConfirm() {
    setConfirmingRemove(false)
    setRemoveError(null)
  }

  async function handleRemove() {
    setRemoving(true)
    setRemoveError(null)
    const result = await removeAddressAction()
    setRemoving(false)
    if ('error' in result) {
      setRemoveError(result.error)
      return
    }
    setAddress(null)
    setConfirmingRemove(false)
  }

  function handleSaved(saved: SavedAddress) {
    setAddress(saved)
    setShowForm(false)
    // Arrived from editing their profile, so take them back to finish it.
    if (returnHref !== '/pro/profile') router.push(returnHref)
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        <Link href={returnHref} className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {returnHref === '/pro/profile' ? 'Back to Profile' : 'Back to editing profile'}
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
                onClick={() => setConfirmingRemove(true)}
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

      {confirmingRemove && (
        <ModalShell
          className="fixed inset-0 z-50 flex items-end justify-center"
          panelClassName="w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl"
          onClose={removing ? () => {} : closeConfirm}
          labelledBy="remove-address-title"
        >
          <h2 id="remove-address-title" className="font-bold text-slate-900 text-lg mb-1">Are you sure?</h2>
          <p className="text-sm text-slate-500 mb-6">
            You need an address to receive bookings. Without one, you won&apos;t get any new bookings until you add
            an address again.
          </p>
          {removeError && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 -mt-2 mb-6">{removeError}</p>
          )}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleRemove}
              disabled={removing}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
              style={{ backgroundColor: '#ef4444' }}
            >
              {removing ? 'Removing…' : 'OK, remove address'}
            </button>
            <button
              onClick={closeConfirm}
              disabled={removing}
              className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm disabled:opacity-50"
            >
              Keep address
            </button>
          </div>
        </ModalShell>
      )}
    </main>
  )
}
