import { describe, expect, it } from 'vitest'
import { OUTDOOR_TASK_MESSAGE, unsupportedTaskMessage } from './unsupportedTasks'

describe('unsupportedTaskMessage', () => {
  it.each(['Take clothes to the dry cleaners', 'dry cleaning', 'Dry-clean my suit', 'drop off at drycleaner'])(
    'stops "%s"',
    (name) => {
      expect(unsupportedTaskMessage(name)).toBe('Tydio doesn’t offer dry cleaning right now.')
    }
  )

  it.each(['Wash and dry laundry', 'Dry the dishes', 'Clean the dryer lint trap', 'Fold clothes'])('allows "%s"', (name) => {
    expect(unsupportedTaskMessage(name)).toBeNull()
  })

  it.each([
    'Rake leaves',
    'Clean the gutters',
    'Mow the lawn',
    'Weed the garden',
    'Shovel snow off the driveway',
    'Sweep the patio',
    'Power wash the deck',
    'Pick up dog poop in the backyard',
    'Clean the pool',
    'Wash my car',
    'Clean outside windows',
    'Trim the bushes',
    'Scrub the BBQ',
  ])('stops outdoor task "%s"', (name) => {
    expect(unsupportedTaskMessage(name)).toBe(OUTDOOR_TASK_MESSAGE)
  })

  it.each([
    'Take out the trash',
    'Take the garbage cans to the curb',
    'Take recycling outside',
    'Bring the bins in from the yard',
    'Wipe the outside of the fridge',
    'Clean the exterior of the microwave',
    'Vacuum the rug',
    'Wipe down counters',
  ])('allows "%s"', (name) => {
    expect(unsupportedTaskMessage(name)).toBeNull()
  })
})
