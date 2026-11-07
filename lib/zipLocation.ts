import zipCities from './zipCities.json'

// City and state for a US ZIP code, from the GeoNames postal code data in
// lib/zipCities.json (rebuild with scripts/build-zip-cities.mjs). Server-only:
// the data is ~800 KB, so keep it out of client components.

export type ZipLocation = { city: string; state: string }

let byZip: Map<string, ZipLocation> | null = null

function index(): Map<string, ZipLocation> {
  if (!byZip) {
    byZip = new Map()
    for (const [state, zips] of Object.entries(zipCities as Record<string, Record<string, string>>)) {
      for (const [zip, city] of Object.entries(zips)) byZip.set(zip, { city, state })
    }
  }
  return byZip
}

// Accepts "30301" or ZIP+4 ("30301-1234"); anything else, or a ZIP not in the
// data (military APO/FPO, very new ZIPs), gives null.
export function zipLocation(zip: string | null | undefined): ZipLocation | null {
  const five = zip?.trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1]
  return five ? index().get(five) ?? null : null
}

// The profiles columns to write alongside zip_code.
export function zipLocationColumns(zip: string | null | undefined): { city: string | null; state: string | null } {
  const location = zipLocation(zip)
  return { city: location?.city ?? null, state: location?.state ?? null }
}
