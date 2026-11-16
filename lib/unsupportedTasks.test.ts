import { describe, expect, it } from 'vitest'
import { OUTDOOR_TASK_MESSAGE, UNSUPPORTED_MESSAGES, unsupportedTaskMessage } from './unsupportedTasks'

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

  it.each<[keyof typeof UNSUPPORTED_MESSAGES, string[]]>([
    ['specialty', [
      'Shampoo the carpet', 'Steam clean the living room rug', 'Carpet cleaning', 'Steam clean the couch',
      'Remove stains from the sofa', 'Clean the mattress', 'Wax the floors', 'Strip the kitchen floor',
      'Regrout the shower', 'Seal the grout', 'Clean the air ducts', 'Sweep the chimney', 'Clean the dryer vent',
      'Post-construction cleanup', 'Clean up construction dust', 'Hoarder cleanout',
    ]],
    ['highAccess', ['Dust the ceiling fan with a ladder', 'Clean the skylights', 'Dust the vaulted ceilings', 'Climb up and dust the top of the cabinets']],
    ['biohazard', [
      'Clean up vomit', 'Clean blood off the floor', 'Clean up poop on the floor', 'Human waste cleanup',
      'Pee on the bathroom floor', 'Dispose of needles', 'Sewage backup in the basement', 'Toilet overflow cleanup',
      'Chemical spill', 'Black mold in the bathroom', 'Mold remediation', 'Asbestos', 'Lead dust cleanup',
    ]],
    ['pest', ['Bed bug treatment', 'Get rid of fleas', 'Clean up roaches', 'Clean up mouse droppings', 'Remove a wasp nest', 'Remove a dead mouse', 'Exterminate ants']],
    ['hauling', ['Junk removal', 'Haul trash to the dump', 'Move the couch upstairs', 'Move the fridge', 'Pull out the stove', 'Pack boxes for the move', 'Unpack the kitchen', 'Help me move']],
    ['repairs', [
      'Fix the leaky sink', 'Unclog the drain', 'Paint the bedroom', 'Assemble the IKEA dresser', 'Build a shelf',
      'Mount the TV', 'Hang shelves', 'Install a curtain rod', 'Replace the light bulbs', 'Change the air filter',
      'Repair the dishwasher', 'Recaulk the tub', 'Patch holes in the wall', 'Rewire the lamp',
    ]],
    ['organizing', ['Declutter the bedroom', 'Organize the garage', 'Clean out the attic', 'Sort through the storage unit', 'Organize my closet', 'Decide what to donate']],
    ['petCare', ['Walk the dog', 'Dog walking', 'Pet sitting', 'Feed the cat', 'Groom the dog', 'Bathe the dog', 'Trim the cat’s nails', 'Let the dog out']],
    ['personal', ['Babysit the kids', 'Watch my kids', 'Elder care', 'Cook dinner', 'Meal prep', 'Grocery shopping', 'Run errands', 'Pick up my prescription', 'Give mom her medication', 'Water the plants']],
    ['garment', ['Hem my pants', 'Tailor a suit', 'Sew a button', 'Shoe shine', 'Polish my shoes', 'Restore the leather jacket']],
  ])('stops %s tasks', (category, names) => {
    for (const name of names) expect(unsupportedTaskMessage(name), name).toBe(UNSUPPORTED_MESSAGES[category])
  })

  it.each([
    // Pet enclosures and litter boxes are offered, waste and all.
    'Clean the litter box',
    'Scoop the cat poop out of the litter box',
    'Clean the rabbit hutch',
    'Clean the mouse cage',
    'Clean bird droppings from the cage',
    // Animal waste is offered anywhere indoors.
    'Dog poop on the carpet',
    'Pet urine on the rug',
    'Clean up the cat pee',
    'Pick up dog poop',
    'Clean up the puppy’s accident',
    'Pet mess in the hallway',
    'Clean up bird droppings on the windowsill',
    // Ordinary cleaning that shares words with the blocked categories.
    'Scrub the grout in the shower',
    'Vacuum the couch cushions',
    'Vacuum the rug',
    'Wipe mildew off the shower tile',
    'Clean pee around the toilet',
    'Remove soap scum build-up',
    'Dust the light fixtures and fan',
    'Organize the junk drawer',
    'Wipe the medicine cabinet',
    'Vacuum pine needles',
    'Wash the dog bed',
    'Vacuum dog hair off the couch',
    'Wipe the cooktop',
    'Wash the cookware',
    'Pick up the kids’ toys',
    'Remove candle wax from the table',
    'Wipe the cabinet doors',
    'Dust the paintings',
    'Wipe down the air vents',
    'Strip the bed and change sheets',
    'Fold and put away clothes',
    'Organize the bookshelf',
    'Vacuum around the Christmas tree',
    'Wipe door handles',
    'Mop the kitchen floor',
    'Iron shirts',
  ])('allows "%s"', (name) => {
    expect(unsupportedTaskMessage(name)).toBeNull()
  })
})
