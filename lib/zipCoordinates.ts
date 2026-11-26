import zipCoordinates from './zipCoordinates.json'
import type { LatLng } from './cleanerMatching'

// The approximate center of a US ZIP code, from the GeoNames postal code data
// in lib/zipCoordinates.json (rebuild with scripts/build-zip-coordinates.mjs).
// Server-only: the data is ~1 MB, so keep it out of client components.

const coordinates = zipCoordinates as Record<string, number[]>

// Accepts "30301" or ZIP+4 ("30301-1234"); anything else, or a ZIP not in the
// data, gives null.
export function zipCoordinatesFor(zip: string | null | undefined): LatLng | null {
  const five = zip?.trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1]
  const point = five ? coordinates[five] : undefined
  return point ? { latitude: point[0], longitude: point[1] } : null
}
