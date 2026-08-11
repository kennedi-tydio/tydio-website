'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

export interface PlaceDetails {
  streetAddress: string
  city: string
  state: string
  zipCode: string
  latitude: number | null
  longitude: number | null
}

interface AddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

interface PlaceResult {
  address_components?: AddressComponent[]
  geometry?: { location?: { lat: () => number; lng: () => number } }
}

interface AutocompleteInstance {
  addListener: (event: string, handler: () => void) => void
  getPlace: () => PlaceResult
}

interface GoogleMapsNamespace {
  maps: {
    places: {
      Autocomplete: new (
        input: HTMLInputElement,
        opts?: Record<string, unknown>
      ) => AutocompleteInstance
    }
  }
}

function getGoogleMaps(): GoogleMapsNamespace | undefined {
  return (window as unknown as { google?: GoogleMapsNamespace }).google
}

function componentValue(components: AddressComponent[], type: string, useShort = false): string {
  const match = components.find((c) => c.types.includes(type))
  if (!match) return ''
  return useShort ? match.short_name : match.long_name
}

function parsePlace(place: PlaceResult): PlaceDetails {
  const components = place.address_components ?? []
  const streetNumber = componentValue(components, 'street_number')
  const route = componentValue(components, 'route')
  const city =
    componentValue(components, 'locality') ||
    componentValue(components, 'sublocality') ||
    componentValue(components, 'postal_town')
  const loc = place.geometry?.location

  return {
    streetAddress: [streetNumber, route].filter(Boolean).join(' '),
    city,
    state: componentValue(components, 'administrative_area_level_1', true),
    zipCode: componentValue(components, 'postal_code'),
    latitude: loc ? loc.lat() : null,
    longitude: loc ? loc.lng() : null,
  }
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

type Props = {
  value: string
  onChange: (value: string) => void
  onPlaceSelect: (details: PlaceDetails) => void
  placeholder?: string
  className?: string
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = 'Street address',
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const onPlaceSelectRef = useRef(onPlaceSelect)
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect
  })

  useEffect(() => {
    if (!scriptReady || !inputRef.current) return
    const googleMaps = getGoogleMaps()
    if (!googleMaps) return

    // Places can fail at runtime (API not enabled, quota exceeded, network issue).
    // That must never block manual typing/saving, so autocomplete setup is best-effort.
    try {
      const autocomplete = new googleMaps.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'geometry'],
      })

      autocomplete.addListener('place_changed', () => {
        try {
          onPlaceSelectRef.current(parsePlace(autocomplete.getPlace()))
        } catch {
          // Malformed/partial place result — leave whatever the user already typed in place.
        }
      })
    } catch {
      // Autocomplete unavailable; input keeps working as a plain text field.
    }
  }, [scriptReady])

  return (
    <>
      {API_KEY && (
        <Script
          id="google-maps-places"
          src={`https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`}
          onReady={() => setScriptReady(true)}
        />
      )}
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className={
          className ??
          'w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-[#38C7CA]'
        }
      />
    </>
  )
}
