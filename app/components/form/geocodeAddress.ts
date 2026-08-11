interface GeocoderResult {
  geometry: { location: { lat: () => number; lng: () => number } }
}

interface Geocoder {
  geocode: (request: { address: string }) => Promise<{ results: GeocoderResult[] }>
}

interface GoogleMapsGeocoding {
  maps: { Geocoder: new () => Geocoder }
}

export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const google = (window as unknown as { google?: GoogleMapsGeocoding }).google
  if (!google?.maps?.Geocoder) return null

  try {
    const { results } = await new google.maps.Geocoder().geocode({ address: query })
    const first = results[0]
    if (!first) return null
    return { lat: first.geometry.location.lat(), lng: first.geometry.location.lng() }
  } catch {
    return null
  }
}
