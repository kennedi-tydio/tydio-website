import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from './safeRedirect'

describe('safeRedirectPath', () => {
  it('keeps same-site paths', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard')
    expect(safeRedirectPath('/book/review?draft=1')).toBe('/book/review?draft=1')
  })

  it('refuses anything that could leave the site', () => {
    for (const next of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '/\t/evil.com', '', null, undefined]) {
      expect(safeRedirectPath(next)).toBeNull()
    }
  })
})
