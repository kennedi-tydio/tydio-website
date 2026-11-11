import { describe, expect, it } from 'vitest'
import { hasAnsweredPets, isOwnPetPhotoPath, petsSummary, validatePetInput } from './customerPets'

describe('validatePetInput', () => {
  it('requires a pet type', () => {
    expect(validatePetInput({ name: 'Rex', petType: '  ', notes: 'Friendly' })).toEqual({ error: 'Choose what kind of pet this is.' })
  })

  it('makes notes optional', () => {
    expect(validatePetInput({ name: '', petType: 'Dog', notes: ' ' })).toEqual({ pet: { name: null, petType: 'Dog', notes: null } })
  })

  it('makes the name optional and trims everything', () => {
    expect(validatePetInput({ name: '  ', petType: ' Cat ', notes: ' Hides under the bed ' })).toEqual({
      pet: { name: null, petType: 'Cat', notes: 'Hides under the bed' },
    })
  })

  it('rejects notes that are too long', () => {
    expect(validatePetInput({ name: '', petType: 'Dog', notes: 'a'.repeat(501) })).toHaveProperty('error')
  })
})

describe('hasAnsweredPets', () => {
  it('is answered with a pet or with "no pets"', () => {
    expect(hasAnsweredPets(false, 0)).toBe(false)
    expect(hasAnsweredPets(true, 0)).toBe(true)
    expect(hasAnsweredPets(false, 2)).toBe(true)
  })
})

describe('petsSummary', () => {
  it('lists each pet on its own line', () => {
    expect(
      petsSummary(
        [
          { name: 'Biscuit', petType: 'Dog', notes: 'Friendly, barks at the door' },
          { name: null, petType: 'Cat', notes: 'Keep the bedroom door shut' },
        ],
        false
      )
    ).toBe('Biscuit (Dog): Friendly, barks at the door\nCat: Keep the bedroom door shut')
  })

  it('leaves off the notes when there are none', () => {
    expect(petsSummary([{ name: 'Rex', petType: 'Dog', notes: null }], false)).toBe('Rex (Dog)')
  })

  it('says "No pets" when they have none', () => {
    expect(petsSummary([], true)).toBe('No pets')
    expect(petsSummary([], false)).toBeNull()
  })
})

describe('isOwnPetPhotoPath', () => {
  it('only accepts files directly in the customer’s folder', () => {
    expect(isOwnPetPhotoPath('p1/abc.jpg', 'p1')).toBe(true)
    expect(isOwnPetPhotoPath('p2/abc.jpg', 'p1')).toBe(false)
    expect(isOwnPetPhotoPath('p1/../p2/abc.jpg', 'p1')).toBe(false)
    expect(isOwnPetPhotoPath('p1/x/abc.jpg', 'p1')).toBe(false)
  })
})
