import { describe, expect, it } from 'vitest'
import { zipLocation, zipLocationColumns } from './zipLocation'

describe('zipLocation', () => {
  it('finds the city and state for a ZIP', () => {
    expect(zipLocation('30301')).toEqual({ city: 'Atlanta', state: 'GA' })
    expect(zipLocation('30060')).toEqual({ city: 'Marietta', state: 'GA' })
    expect(zipLocation('10001')).toEqual({ city: 'New York', state: 'NY' })
  })

  it('accepts ZIP+4 and surrounding spaces', () => {
    expect(zipLocation(' 30301-1234 ')).toEqual({ city: 'Atlanta', state: 'GA' })
  })

  it('gives null for malformed or unknown ZIPs', () => {
    expect(zipLocation(null)).toBeNull()
    expect(zipLocation('')).toBeNull()
    expect(zipLocation('3030')).toBeNull()
    expect(zipLocation('abcde')).toBeNull()
    expect(zipLocation('00000')).toBeNull()
    expect(zipLocation('09001')).toBeNull() // APO AA, no state
  })
})

describe('zipLocationColumns', () => {
  it('maps to profile columns, null when unknown', () => {
    expect(zipLocationColumns('30301')).toEqual({ city: 'Atlanta', state: 'GA' })
    expect(zipLocationColumns('00000')).toEqual({ city: null, state: null })
  })
})
