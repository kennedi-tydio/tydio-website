import { describe, expect, it } from 'vitest'
import {
  isOwnTaskPhotoPath,
  litterOptionFromName,
  petDetailLabel,
  petTaskKindFromName,
  petTaskPhotoPaths,
  petTypeFromName,
} from './petTasks'
import { bookedTaskName } from './laundry'

describe('petTaskKindFromName', () => {
  it.each([
    ['clean my rabbit cage', 'enclosure'],
    ['wash the guinea pig enclosure', 'enclosure'],
    ['Clean the bunny hutch', 'enclosure'],
    ['clean hamster habitat', 'enclosure'],
    ['clean the gecko tank', 'enclosure'],
    ['clean the litter box', 'litterBox'],
    ['scoop cat litter', 'litterBox'],
    ['Empty and wash litter boxes', 'litterBox'],
  ])('%s → %s', (name, kind) => {
    expect(petTaskKindFromName(name)).toBe(kind)
  })

  it.each(['clean the toilet tank', 'wipe the playpen', 'clean the fish tank', 'vacuum the rug', 'pet hair on couch', 'clean the cat bowl'])(
    'leaves "%s" as an ordinary task',
    (name) => {
      expect(petTaskKindFromName(name)).toBeNull()
    }
  )
})

describe('petTypeFromName', () => {
  it('reads the pet from the description', () => {
    expect(petTypeFromName('clean my rabbit cage')).toBe('Rabbit')
    expect(petTypeFromName('wash the guinea pig enclosure')).toBe('Guinea pig')
    expect(petTypeFromName('clean the parakeet cage')).toBe('Bird')
  })

  it('returns null when no pet is named, so the customer is asked', () => {
    expect(petTypeFromName('clean the cage')).toBeNull()
    expect(petTypeFromName('clean the enclosure')).toBeNull()
  })
})

describe('litterOptionFromName', () => {
  it('preselects only when the description clearly picks one', () => {
    expect(litterOptionFromName('scoop cat litter')).toBe('scoop')
    expect(litterOptionFromName('empty and wash the litter box')).toBe('fullChange')
    expect(litterOptionFromName('change the litter')).toBe('fullChange')
    expect(litterOptionFromName('clean the litter box')).toBeNull()
    expect(litterOptionFromName('scoop and then wash the litter box')).toBeNull()
  })
})

describe('labels', () => {
  const enclosure = {
    name: 'Clean rabbit cage',
    room: 'Bedroom',
    pet: { kind: 'enclosure' as const, petType: 'Rabbit', scope: 'x', photos: ['u/a.jpg'] },
  }
  const litter = {
    name: 'Scoop litter',
    room: 'Laundry room',
    pet: { kind: 'litterBox' as const, litterOption: 'scoop' as const, scope: 'x', photos: ['u/b.jpg', 'u/a.jpg'] },
  }

  it('describes a pet task for summaries and the Tidy Pro checklist', () => {
    expect(petDetailLabel(enclosure)).toBe('Rabbit enclosure')
    expect(petDetailLabel(litter)).toBe('Litter box · Scoop only')
    expect(petDetailLabel({ pet: null })).toBeNull()
    expect(bookedTaskName(enclosure)).toBe('Clean rabbit cage (Rabbit enclosure)')
    expect(bookedTaskName(litter)).toBe('Scoop litter (Litter box · Scoop only)')
  })

  it('collects each saved photo once', () => {
    expect(petTaskPhotoPaths([enclosure, litter, { pet: null }])).toEqual(['u/a.jpg', 'u/b.jpg'])
  })
})

describe('isOwnTaskPhotoPath', () => {
  const me = '7f1c1a52-2f7b-4c1e-9d3e-0a1b2c3d4e5f'
  const file = '0b8e2a6c-1d2e-4f3a-8b9c-0d1e2f3a4b5c.jpg'

  it('accepts only uploads in the customer’s own folder', () => {
    expect(isOwnTaskPhotoPath(`${me}/${file}`, me)).toBe(true)
    expect(isOwnTaskPhotoPath(`someone-else/${file}`, me)).toBe(false)
    expect(isOwnTaskPhotoPath(`${me}/../x/${file}`, me)).toBe(false)
    expect(isOwnTaskPhotoPath(`${me}/${file.replace('.jpg', '.svg')}`, me)).toBe(false)
    expect(isOwnTaskPhotoPath(42, me)).toBe(false)
  })
})
