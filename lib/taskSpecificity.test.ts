import { describe, expect, it } from 'vitest'
import { broadTaskMessage } from './taskSpecificity'

describe('broadTaskMessage', () => {
  it.each([
    'Clean bathroom',
    'clean the bathroom',
    'Clean my kitchen',
    'Deep clean the entire house',
    'Tidy up living room',
    'Tidy the bedroom up',
    'Organize the closet',
    'Clean the whole apartment',
    'Bathroom',
    'Kitchen cleaning',
    'clean up',
    'General cleaning',
    'Sanitize bathroom!',
    'Clean the room',
  ])('rejects "%s"', (name) => {
    expect(broadTaskMessage(name, 'Bathroom')).not.toBeNull()
  })

  it.each([
    'Scrub the toilet',
    'Wipe down kitchen counters',
    'Clean the microwave inside',
    'Clean bathroom mirror',
    'Clean the shower',
    'Vacuum the bedroom floor',
    'Do the dishes',
    'Do laundry',
    'Mop the kitchen floor',
    'Pick up toys',
    'Organize the spice rack',
    'Clean litter box',
    '',
  ])('accepts "%s"', (name) => {
    expect(broadTaskMessage(name, 'Kitchen')).toBeNull()
  })

  it('catches a custom room the customer picked', () => {
    expect(broadTaskMessage('Clean sunroom', 'Sunroom')).not.toBeNull()
    expect(broadTaskMessage('Clean sunroom', 'Kitchen')).toBeNull()
  })

  it('suggests jobs for the room named', () => {
    expect(broadTaskMessage('Clean kitchen', 'Bathroom')).toContain('microwave')
    expect(broadTaskMessage('Clean bathroom', 'Kitchen')).toContain('toilet')
  })
})
