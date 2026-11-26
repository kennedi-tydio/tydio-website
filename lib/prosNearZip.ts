import { MAX_TRAVEL_RADIUS_MILES, haversineDistanceMiles } from './cleanerMatching'
import { isHiddenFromCustomer } from './privateTidyPros'
import { zipCoordinatesFor } from './zipCoordinates'

// Which Tidy Pros would travel to a customer's ZIP code, for the admin Users
// page. Pass only Tidy Pros who can accept bookings. A Tidy Pro counts when the
// ZIP's center is within the travel radius they chose (capped at
// MAX_TRAVEL_RADIUS_MILES, as in customer search). Private Tidy Pros only count
// for the customers allowed to see them.

export interface ProLocation {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  travel_radius_miles: number | null
}

export interface ProNearby {
  id: string
  name: string
  distanceMiles: number
  radiusMiles: number
}

// null when the ZIP is missing or unknown, so there's nothing to measure from.
// Otherwise the Tidy Pros in range, nearest first.
export function prosNearZip(
  zip: string | null | undefined,
  customerId: string,
  pros: ProLocation[]
): ProNearby[] | null {
  const point = zipCoordinatesFor(zip)
  if (!point) return null
  const nearby: ProNearby[] = []
  for (const pro of pros) {
    if (pro.latitude == null || pro.longitude == null || pro.travel_radius_miles == null) continue
    if (isHiddenFromCustomer(pro.id, customerId)) continue
    const radiusMiles = Math.min(pro.travel_radius_miles, MAX_TRAVEL_RADIUS_MILES)
    const distanceMiles = haversineDistanceMiles(point, { latitude: pro.latitude, longitude: pro.longitude })
    if (distanceMiles <= radiusMiles) nearby.push({ id: pro.id, name: pro.name, distanceMiles, radiusMiles })
  }
  return nearby.sort((a, b) => a.distanceMiles - b.distanceMiles)
}
