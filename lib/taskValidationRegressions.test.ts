import { it, expect } from 'vitest'
import { isSpecificHandlingTask, reasonSuggestsTaskItself } from './taskSpecificity'
import { petTaskKindFromName } from './petTasks'
import { unsupportedTaskMessage } from './unsupportedTasks'
import { decideOverlap } from './fullServiceScope'
import type { FullServiceSelection } from './fullService'
it('accepts litter box, laundry and sheet-folding tasks from the booking test', () => {
  expect(isSpecificHandlingTask('Fold flat sheets')).toBe(true)
  expect(isSpecificHandlingTask('Fold flat sheets and put them on the armchair')).toBe(true)
  expect(isSpecificHandlingTask('Clean stuff')).toBe(false)
  expect(reasonSuggestsTaskItself('That’s too vague. Edit it, like “Fold flat sheets” or “Put flat sheets on the armchair”.', 'fold flat sheets')).toBe(true)
  expect(petTaskKindFromName('wash litterbox')).toBe('litterBox')
  expect(petTaskKindFromName('Clean litter-boxes')).toBe('litterBox')
  expect(unsupportedTaskMessage('wash litterbox')).toBeNull()
  const whole = { type: 'standard', scope: 'entire_home', rooms: {}, addOns: {}, priorities: [] } as unknown as FullServiceSelection
  expect(decideOverlap({ name: 'wash litterbox', room: 'Entire home' }, whole).kind).toBe('none')
  expect(decideOverlap({ name: 'Wash and dry towels', room: 'Bathroom' }, whole).kind).toBe('none')
  const bathOnly = { type: 'standard', scope: 'rooms', rooms: { full_bath: 1 }, addOns: {}, priorities: [] } as unknown as FullServiceSelection
  expect(decideOverlap({ name: 'Fold flat sheets', room: 'Bedroom' }, bathOnly).kind).toBe('none')
  expect(decideOverlap({ name: 'Change the sheets', room: 'Bedroom' }, bathOnly).kind).toBe('suggest_addon')
  expect(decideOverlap({ name: 'Scrub the toilet', room: 'Bathroom' }, whole).kind).toBe('included_entire_home')
})
