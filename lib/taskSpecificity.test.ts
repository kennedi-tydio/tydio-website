import { describe, expect, it } from 'vitest'
import {
  aiNamedSpecificThing,
  broadTaskMessage,
  combinedTaskMessage,
  isSpecificFloorTask,
  taskTextNamesOneThing,
  vagueFloorMessage,
} from './taskSpecificity'

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
    'Clean bathtub',
    'Clean the tub',
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

  it.each(['Floor cleaning', 'Clean the floor', 'clean floors', 'Floors', 'Clean the kitchen floor', 'Floor care', 'Tidy up the floor'])(
    'asks how the floor should be cleaned for "%s"',
    (name) => {
      expect(broadTaskMessage(name, 'Kitchen')).toBe(
        'That’s too vague for a Tidy Task. Edit the task to say how the floor should be cleaned, like “Sweep floor”, “Mop floor” or “Vacuum floor”.'
      )
    }
  )

  it.each(['Floor cleaning', 'Clean the floors', 'Clean the entire home floors'])('catches "%s" in Entire home', (name) => {
    expect(vagueFloorMessage(name, 'Entire home')).toContain('Edit the task to say how the floor should be cleaned')
    expect(vagueFloorMessage('Sweep floors', 'Entire home')).toBeNull()
  })

  it.each(['Sweep the floor', 'Mop the kitchen floor', 'Vacuum floors', 'Clean the floor mat', 'Wipe up the spill on the floor'])(
    'accepts specific floor task "%s"',
    (name) => {
      expect(broadTaskMessage(name, 'Kitchen')).toBeNull()
    }
  )
})

describe('combinedTaskMessage', () => {
  it.each([
    'Sweep and mop floor',
    'Sweep & mop the kitchen floor',
    'sweep/mop floors',
    'Wipe counters, scrub the sink',
    'Dust shelves and vacuum the rug',
    'Vacuum then mop',
    'Make the bed and change the sheets',
    'Wash and fold laundry',
    'Empty the dishwasher and wipe the counters',
  ])('rejects "%s"', (name) => {
    expect(combinedTaskMessage(name)).toMatch(/^That’s more than one task/)
  })

  it('names each job, sharing the object named at the end', () => {
    expect(combinedTaskMessage('Sweep and mop floor')).toBe(
      'That’s more than one task. Add each job as its own task, like “Sweep floor” and “Mop floor”.'
    )
    expect(combinedTaskMessage('Wipe counters, scrub sink, mop floor')).toContain('“Wipe counters”, “Scrub sink” and “Mop floor”')
  })

  it.each([
    'Scrub the toilet',
    'Wash and dry the dishes',
    'Wash & dry laundry',
    'Fold and put away clothes',
    'Wipe and sanitize the counters',
    'Scrub and rinse the tub',
    'Wash pots and pans',
    'Dust the shelves and books',
    'Pick up toys and put them away',
    'Clean litter box',
    'Scoop and refill the litter box',
    'Empty and wash the litter box',
    'Take out trash and recycling',
    '',
  ])('accepts "%s"', (name) => {
    expect(combinedTaskMessage(name)).toBeNull()
  })
})

describe('isSpecificFloorTask', () => {
  it('treats sweep, mop and vacuum floor tasks as specific', () => {
    for (const n of ['Mop floor', 'Mop the kitchen floor', 'Sweep floor', 'Vacuum floors', 'Mopping floors']) {
      expect(isSpecificFloorTask(n)).toBe(true)
      expect(vagueFloorMessage(n, 'Kitchen')).toBeNull()
    }
  })
  it('does not treat a vague floor task as specific', () => {
    expect(isSpecificFloorTask('Clean the floor')).toBe(false)
    expect(isSpecificFloorTask('Floor cleaning')).toBe(false)
  })
})

describe('aiNamedSpecificThing', () => {
  it('accepts one action on one named thing', () => {
    expect(aiNamedSpecificThing('clean', 'shower')).toBe(true)
    expect(aiNamedSpecificThing('organize', 'the bookshelf')).toBe(true)
    expect(aiNamedSpecificThing('wash', 'dishes')).toBe(true)
  })
  it.each([
    ['', 'shower'],
    ['clean', ''],
    ['clean', 'bathroom'],
    ['clean', 'kitchen stuff'],
    ['clean', 'everything'],
    ['clean', 'floor'],
    ['clean', 'toilet and tub'],
    ['clean', 'toilet, tub'],
    [undefined, undefined],
  ])('rejects action %j on thing %j', (action, thing) => {
    expect(aiNamedSpecificThing(action, thing)).toBe(false)
  })
})

describe('taskTextNamesOneThing', () => {
  it.each(['Tidy the coffee table', 'Straighten the bookshelves', 'Clean the shower', 'Wipe down the stove'])(
    'reads "%s" as one job on one thing',
    (name) => expect(taskTextNamesOneThing(name)).toBe(true)
  )
  it.each([
    'Dust', 'Tidy up', 'Clean', 'Clean bathroom', 'Clean everything', 'Make it nice', 'Help me',
    'Clean the toilet and the tub', 'Clean the floor', 'Living room stuff', 'Declutter the garage',
    'Clean entire kitchen top to bottom', 'Clean the whole guest bathroom',
  ])('does not read "%s" as one job on one thing', (name) => expect(taskTextNamesOneThing(name)).toBe(false))
})
