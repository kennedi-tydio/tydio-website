import { describe, expect, it } from 'vitest'
import { hasAvailability, missingOnboardingSteps } from './cleanerOnboarding'

const complete: Parameters<typeof missingOnboardingSteps>[0] = {
  profile_photo_url: 'https://example.com/photo.jpg',
  bio: 'Hi, I clean.',
  availability: { mon: [{ start: '09:00', end: '17:00' }] },
  stripe_onboarding_completed: true,
  travel_radius_miles: 10,
  latitude: 33.77,
  longitude: -84.29,
}

describe('hasAvailability', () => {
  it('needs at least one real time range', () => {
    expect(hasAvailability(complete.availability)).toBe(true)
    expect(hasAvailability({})).toBe(false)
    expect(hasAvailability({ mon: [], tue: [] })).toBe(false)
    expect(hasAvailability(null)).toBe(false)
  })
})

describe('missingOnboardingSteps', () => {
  it('is empty when everything is done', () => {
    expect(missingOnboardingSteps(complete)).toEqual([])
  })

  it('names each missing step on its own', () => {
    const labelFor = (change: Partial<typeof complete>) => missingOnboardingSteps({ ...complete, ...change }).map((s) => s.label)
    expect(labelFor({ stripe_onboarding_completed: false })).toEqual(['Set up your payout method'])
    expect(labelFor({ availability: {} })).toEqual(['Choose your availability'])
    expect(labelFor({ profile_photo_url: null })).toEqual(['Add a profile picture'])
    expect(labelFor({ bio: '   ' })).toEqual(['Write your bio'])
    expect(labelFor({ latitude: null, longitude: null })).toEqual(['Add your address'])
    expect(labelFor({ travel_radius_miles: null })).toEqual(['Set your travel distance'])
  })
})
