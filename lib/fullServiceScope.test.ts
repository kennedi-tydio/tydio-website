import { describe, expect, it } from 'vitest'
import { emptySelection, type FullServiceSelection } from './fullService'
import { decideOverlap, matchAddOn, roomTypesForTaskRoom, sameRoomQuestion, scopeOf } from './fullServiceScope'

const rooms = (r: FullServiceSelection['rooms'], type: 'standard' | 'deep' = 'standard'): FullServiceSelection => ({
  ...emptySelection(type),
  scope: 'rooms',
  rooms: r,
})
const task = (name: string, room: string, extra: Record<string, unknown> = {}) => ({ name, room, ...extra })

describe('roomTypesForTaskRoom', () => {
  it.each([
    ['Kitchen', ['kitchen']],
    ['Bathroom', ['full_bath', 'half_bath']],
    ['Upstairs bathroom', ['full_bath', 'half_bath']],
    ['Powder room', ['full_bath', 'half_bath']],
    ['Bedroom', ['bedroom']],
    ["Kids' room", ['bedroom']],
    ['Family room', ['living_room']],
    ['Dining room', ['dining_room']],
    ['Home office', ['home_office']],
    ['Foyer', ['hallway']],
  ] as const)('%s', (room, expected) => {
    expect(roomTypesForTaskRoom(room)).toEqual(expected)
  })

  it('knows Entire home and unrelated rooms', () => {
    expect(roomTypesForTaskRoom('Entire home')).toBe('all')
    expect(roomTypesForTaskRoom('Garage')).toBeNull()
  })
})

describe('matchAddOn', () => {
  it.each([
    ['Clean inside the fridge', 'inside_fridge'],
    ['Clean out freezer', 'inside_freezer'],
    ['Clean the oven', 'inside_oven'],
    ['Wipe inside cabinets', 'inside_cabinets'],
    ['Clean window tracks', 'window_tracks'],
    ['Wash windows', 'interior_windows'],
    ['Change the sheets', 'change_linens'],
    ['Load the dishwasher', 'wash_dishes'],
    ['Remove dog hair from rug', 'heavy_pet_hair'],
    ['Scrub baseboards', 'detailed_baseboards'],
    ['Dust the blinds', 'detailed_blinds'],
    ['Clean ceiling fan', 'detailed_ceiling_fan'],
    ['Wipe down doors', 'detailed_doors'],
    ['Spot clean walls', 'wall_spot_cleaning'],
  ] as const)('%s → %s', (name, key) => {
    expect(matchAddOn(name)).toBe(key)
  })

  it('leaves exteriors (part of the service) alone', () => {
    expect(matchAddOn('Wipe fridge exterior')).toBeNull()
    expect(matchAddOn('Wipe cabinet fronts')).toBeNull()
    expect(matchAddOn('Clean the stovetop')).toBeNull()
  })
})

describe('scopeOf', () => {
  it('sorts tasks into included, add-on, out of scope and unknown', () => {
    expect(scopeOf('Scrub the toilet', 'standard').scope).toBe('included')
    expect(scopeOf('Clean inside oven', 'standard')).toEqual({ scope: 'addon', addOn: 'inside_oven' })
    expect(scopeOf('Scrub grout', 'standard').scope).toBe('out_of_scope')
    expect(scopeOf('Organize the closet', 'deep').scope).toBe('out_of_scope')
    expect(scopeOf('Water the plants', 'standard').scope).toBe('unknown')
  })

  it('counts Standard-only add-ons as included in Deep Cleaning', () => {
    expect(scopeOf('Scrub baseboards', 'standard').scope).toBe('addon')
    expect(scopeOf('Scrub baseboards', 'deep').scope).toBe('included')
  })
})

describe('decideOverlap', () => {
  it('asks about the same or a different room when that room type is booked', () => {
    const d = decideOverlap(task('Scrub toilet', 'Bathroom'), rooms({ kitchen: 1, full_bath: 1 }))
    expect(d).toEqual({ kind: 'ask_same_room', roomNoun: 'bathroom', serviceLabel: 'Standard Cleaning' })
    if (d.kind === 'ask_same_room') {
      expect(sameRoomQuestion(d)).toBe('Is this task for the same bathroom included in your Standard Cleaning, or a different bathroom?')
    }
  })

  it('asks for every room category', () => {
    for (const [room, sel] of [
      ['Bedroom', { bedroom: 2 }],
      ['Kitchen', { kitchen: 1 }],
      ['Living room', { living_room: 1 }],
      ['Dining room', { dining_room: 1 }],
      ['Office', { home_office: 1 }],
      ['Hallway', { hallway: 1 }],
      ['Half bath', { half_bath: 1 }],
    ] as const) {
      expect(decideOverlap(task('Vacuum the floor', room), rooms(sel)).kind).toBe('ask_same_room')
    }
  })

  it('doesn’t ask for a room type that isn’t booked', () => {
    expect(decideOverlap(task('Scrub toilet', 'Bathroom'), rooms({ kitchen: 1 }))).toEqual({ kind: 'none' })
    expect(decideOverlap(task('Sweep', 'Garage'), rooms({ kitchen: 1 }))).toEqual({ kind: 'none' })
  })

  it('never asks about laundry, laundromat, pet enclosure or litter box tasks, even with the whole home', () => {
    const whole = emptySelection('standard')
    expect(decideOverlap(task('Wash & dry', 'Laundry', { laundryService: 'washDry' }), whole).kind).toBe('none')
    expect(decideOverlap(task('Old laundry', 'Bedroom', { laundryLoads: { wash: 1 } }), whole).kind).toBe('none')
    const pet = { kind: 'litterBox', petType: 'cat', litterOption: 'scoop', scope: '', photos: [] }
    expect(decideOverlap(task('Litter box', 'Bathroom', { pet }), whole).kind).toBe('none')
  })

  it('suggests the add-on instead of a Tidy Task', () => {
    expect(decideOverlap(task('Clean inside fridge', 'Kitchen'), rooms({ kitchen: 1 }))).toEqual({ kind: 'suggest_addon', addOn: 'inside_fridge' })
  })

  it('treats Deep Cleaning’s own detail work as included', () => {
    expect(decideOverlap(task('Scrub baseboards', 'Bedroom'), rooms({ bedroom: 1 }, 'deep')).kind).toBe('ask_same_room')
  })

  it('says the whole home is covered, allowing extra work only when it’s unclear', () => {
    expect(decideOverlap(task('Mop floors', 'Kitchen'), emptySelection('deep'))).toEqual({
      kind: 'included_entire_home',
      serviceLabel: 'Deep Cleaning',
      allowAddAnyway: false,
    })
    expect(decideOverlap(task('Water the plants', 'Living room'), emptySelection('standard'))).toMatchObject({ allowAddAnyway: true })
  })

  it('lets work outside the service through as a Tidy Task', () => {
    expect(decideOverlap(task('Scrub grout', 'Bathroom'), rooms({ full_bath: 1 }))).toEqual({ kind: 'none', outOfScope: true })
  })

  it('does nothing without a cleaning', () => {
    expect(decideOverlap(task('Scrub toilet', 'Bathroom'), null)).toEqual({ kind: 'none' })
  })
})
