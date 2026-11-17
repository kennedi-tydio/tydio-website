import { describe, expect, it } from 'vitest'
import { STATE_TIME_ZONES, timeZoneForState } from './serviceTimeZone'

describe('timeZoneForState', () => {
  it('uses the home state, not the device', () => {
    expect(timeZoneForState('GA')).toBe('America/New_York')
    expect(timeZoneForState(' ga ')).toBe('America/New_York')
    expect(timeZoneForState('CA')).toBe('America/Los_Angeles')
    expect(timeZoneForState('AZ')).toBe('America/Phoenix')
  })

  it('returns null when the state is unknown', () => {
    expect(timeZoneForState(null)).toBeNull()
    expect(timeZoneForState('')).toBeNull()
    expect(timeZoneForState('Georgia')).toBeNull()
  })

  it('only lists zones the runtime recognizes', () => {
    for (const zone of Object.values(STATE_TIME_ZONES)) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow()
    }
  })
})
