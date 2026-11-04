import { describe, expect, it } from 'vitest'
import { isAutomationAuthorized } from './automationAuth'

describe('isAutomationAuthorized', () => {
  it('accepts the configured key', () => {
    expect(isAutomationAuthorized('Bearer secret', 'secret')).toBe(true)
  })

  it('rejects a wrong or missing key', () => {
    expect(isAutomationAuthorized('Bearer wrong', 'secret')).toBe(false)
    expect(isAutomationAuthorized('secret', 'secret')).toBe(false)
    expect(isAutomationAuthorized(null, 'secret')).toBe(false)
  })

  it('refuses everything when no key is configured', () => {
    expect(isAutomationAuthorized('Bearer ', '')).toBe(false)
    expect(isAutomationAuthorized('Bearer undefined', undefined)).toBe(false)
  })
})
