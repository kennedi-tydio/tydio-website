import { describe, expect, it } from 'vitest'
import { prosNearZip, type ProLocation } from './prosNearZip'
import { zipCoordinatesFor } from './zipCoordinates'

// Marietta (30060) is about 14 miles from downtown Atlanta (30303).
const MARIETTA = { latitude: 33.938, longitude: -84.54 }
const SAVANNAH = { latitude: 32.075, longitude: -81.088 }

function pro(overrides: Partial<ProLocation>): ProLocation {
  return { id: 'p1', name: 'Pro', ...MARIETTA, travel_radius_miles: 20, ...overrides }
}

describe('zipCoordinatesFor', () => {
  it('finds a ZIP center, accepting ZIP+4', () => {
    expect(zipCoordinatesFor('30303')).toEqual({ latitude: 33.753, longitude: -84.389 })
    expect(zipCoordinatesFor(' 30303-1234 ')).toEqual({ latitude: 33.753, longitude: -84.389 })
  })

  it('gives null for malformed or unknown ZIPs', () => {
    expect(zipCoordinatesFor(null)).toBeNull()
    expect(zipCoordinatesFor('3030')).toBeNull()
    expect(zipCoordinatesFor('00000')).toBeNull()
  })
})

describe('prosNearZip', () => {
  it('counts a Tidy Pro whose radius reaches the ZIP', () => {
    const result = prosNearZip('30303', 'c1', [pro({ travel_radius_miles: 20 })])
    expect(result).toHaveLength(1)
    expect(result![0].distanceMiles).toBeGreaterThan(13)
    expect(result![0].distanceMiles).toBeLessThan(16)
  })

  it('leaves out a Tidy Pro whose radius falls short', () => {
    expect(prosNearZip('30303', 'c1', [pro({ travel_radius_miles: 10 })])).toEqual([])
  })

  it('caps the radius at the maximum Tidy Pros can choose', () => {
    expect(prosNearZip('30303', 'c1', [pro({ ...SAVANNAH, travel_radius_miles: 500 })])).toEqual([])
  })

  it('skips Tidy Pros with no location or radius', () => {
    expect(
      prosNearZip('30303', 'c1', [pro({ latitude: null }), pro({ travel_radius_miles: null })])
    ).toEqual([])
  })

  it('hides private Tidy Pros from other customers', () => {
    const privatePro = pro({ id: '26c6fa0a-3fff-4d86-97b5-340400c8d93d' })
    expect(prosNearZip('30303', 'someone-else', [privatePro])).toEqual([])
    expect(prosNearZip('30303', 'df53cdfe-4ccf-4e13-a52f-19af0727ea33', [privatePro])).toHaveLength(1)
  })

  it('sorts nearest first', () => {
    const near = pro({ id: 'near', latitude: 33.76, longitude: -84.39 })
    const far = pro({ id: 'far' })
    expect(prosNearZip('30303', 'c1', [far, near])!.map((p) => p.id)).toEqual(['near', 'far'])
  })

  it('gives null when the ZIP is unknown', () => {
    expect(prosNearZip(null, 'c1', [pro({})])).toBeNull()
  })
})
