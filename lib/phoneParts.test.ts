import { describe, expect, it } from 'vitest'
import { joinPhone, localPhone, splitPhone, withoutCountryCode } from './phoneParts'

describe('splitPhone', () => {
  it('defaults to the US with an empty number', () => {
    expect(splitPhone(null)).toEqual({ country: 'US', number: '' })
    expect(splitPhone('  ')).toEqual({ country: 'US', number: '' })
  })

  it('treats a number without + as US', () => {
    expect(splitPhone('1234567890')).toEqual({ country: 'US', number: '1234567890' })
    expect(splitPhone('(404) 555-0100')).toEqual({ country: 'US', number: '(404) 555-0100' })
    expect(splitPhone('1-404-555-0100')).toEqual({ country: 'US', number: '4045550100' })
  })

  it('reads +1 as the US', () => {
    expect(splitPhone('+11234567890')).toEqual({ country: 'US', number: '1234567890' })
    expect(splitPhone('+1 (404) 555-0100')).toEqual({ country: 'US', number: '4045550100' })
  })

  it('matches other countries by dial code', () => {
    expect(splitPhone('+44 20 7946 0958')).toEqual({ country: 'GB', number: '2079460958' })
    expect(splitPhone('+353 1 234 5678')).toEqual({ country: 'IE', number: '12345678' })
  })

  it('leaves a +number matching no listed code whole', () => {
    expect(splitPhone('+999 1234')).toEqual({ country: 'US', number: '+999 1234' })
  })
})

describe('joinPhone', () => {
  it('joins the country code and number', () => {
    expect(joinPhone('US', '(404) 555-0100')).toBe('+14045550100')
    expect(joinPhone('GB', '20 7946 0958')).toBe('+442079460958')
  })

  it('keeps a number that carries its own country code', () => {
    expect(joinPhone('US', '+44 20 7946 0958')).toBe('+442079460958')
  })

  it('returns null for an unknown country', () => {
    expect(joinPhone('XX', '4045550100')).toBeNull()
  })

  it('round-trips with splitPhone', () => {
    for (const saved of ['+11234567890', '+442079460958']) {
      const { country, number } = splitPhone(saved)
      expect(joinPhone(country, number)).toBe(saved)
    }
  })
})

describe('localPhone', () => {
  it('drops the +1 and formats a US number', () => {
    expect(localPhone('+15551234567')).toBe('(555) 123-4567')
    expect(localPhone('1 555 123 4567')).toBe('(555) 123-4567')
    expect(localPhone('555-123-4567')).toBe('(555) 123-4567')
  })
  it('drops other country codes too', () => {
    expect(localPhone('+447911123456')).toBe('7911123456')
  })
  it('leaves empty and unmatched numbers alone', () => {
    expect(localPhone(null)).toBe('')
    expect(localPhone('')).toBe('')
    expect(localPhone('+999123')).toBe('+999123')
  })
})

describe('withoutCountryCode', () => {
  it('drops a typed or autofilled +1', () => {
    expect(withoutCountryCode('+1 (555) 123-4567')).toBe('(555) 123-4567')
    expect(withoutCountryCode('+15551234567')).toBe('5551234567')
    expect(withoutCountryCode('+')).toBe('')
    expect(withoutCountryCode('1 555 123 4567')).toBe('555 123 4567')
  })
  it('leaves a plain number alone while typing', () => {
    expect(withoutCountryCode('(555) 123-4567')).toBe('(555) 123-4567')
    expect(withoutCountryCode('1')).toBe('1')
    expect(withoutCountryCode('555123456')).toBe('555123456')
  })
})
