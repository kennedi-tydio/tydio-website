'use client'

import { useState } from 'react'
import { saveAddressAction, type SavedAddress } from './actions'
import StateSelect from '@/app/components/form/StateSelect'
import AddressAutocomplete, { type PlaceDetails } from '@/app/components/form/AddressAutocomplete'
import { geocodeAddress } from '@/app/components/form/geocodeAddress'
import ModalShell from '@/app/components/ModalShell'

type Props = {
  onSaved: (address: SavedAddress) => void
  onClose: () => void
}

export default function AddressForm({ onSaved, onClose }: Props) {
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = streetAddress.trim() && city.trim() && state.trim() && zipCode.trim()

  function handlePlaceSelect(details: PlaceDetails) {
    setStreetAddress(details.streetAddress)
    if (details.city) setCity(details.city)
    if (details.state) setState(details.state)
    if (details.zipCode) setZipCode(details.zipCode)
    setCoords({ lat: details.latitude, lng: details.longitude })
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)

    let { lat, lng } = coords
    if (lat == null || lng == null) {
      const geocoded = await geocodeAddress(`${streetAddress}, ${city}, ${state} ${zipCode}`)
      if (geocoded) {
        lat = geocoded.lat
        lng = geocoded.lng
      }
    }

    const result = await saveAddressAction({
      streetAddress,
      city,
      state,
      zipCode,
      latitude: lat,
      longitude: lng,
    })
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onSaved(result)
  }

  return (
    <ModalShell panelClassName="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl px-6 pt-6 pb-8 shadow-2xl max-h-[85vh] overflow-y-auto" onClose={onClose} labelledBy="address-form-title">
      <div className="flex items-center justify-between mb-5">
        <h2 id="address-form-title" className="text-xl font-bold text-slate-900">Add Address</h2>
        <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-3 mb-5">
        <AddressAutocomplete
          value={streetAddress}
          onChange={setStreetAddress}
          onPlaceSelect={handlePlaceSelect}
          placeholder="Street address"
        />
        <input
          aria-label="City"
          type="text"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
        />
        <div className="flex gap-3">
          <StateSelect value={state} onChange={setState} className="w-1/2" />
          <input
            aria-label="Zip code"
            type="text"
            placeholder="Zip code"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            className="w-1/2 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: '#1a2332' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalShell>
  )
}
