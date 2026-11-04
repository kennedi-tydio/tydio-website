import { describe, expect, it } from 'vitest'
import { isSquareFootage, squareFootageLabel } from './squareFootage'

describe('square footage', () => {
  it('accepts only the four buckets', () => {
    expect(isSquareFootage('under_1000')).toBe(true)
    expect(isSquareFootage('3000_plus')).toBe(true)
    expect(isSquareFootage('1500')).toBe(false)
    expect(isSquareFootage(null)).toBe(false)
  })

  it('labels a bucket, and returns null for a missing one', () => {
    expect(squareFootageLabel('1000_1999')).toBe('1,000-1,999 sqft')
    expect(squareFootageLabel(null)).toBeNull()
  })
})
