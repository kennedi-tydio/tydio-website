import { describe, expect, it } from 'vitest'
import {
  switchedToWashDryMessage,
  washDryTaskName,
  startOnlyQuestion,
  bookedTaskName,
  formatBaskets,
  isLaundromatPartialCycle,
  isLaundryTaskName,
  isValidBasketCount,
  isValidIronItemCount,
  laundryDetailLabel,
  laundryServiceFromName,
  usesLaundromat,
  dropUnmatchedLaundryLinks,
  formatVisitDuration,
  linkableLaundryTasks,
  pairedMachineLoads,
} from './laundry'

describe('laundry task names', () => {
  it('recognises laundry tasks, including ironing', () => {
    expect(isLaundryTaskName('Laundry')).toBe(true)
    expect(isLaundryTaskName('Fold clothes')).toBe(true)
    expect(isLaundryTaskName('Iron shirts')).toBe(true)
    expect(isLaundryTaskName('Ironing')).toBe(true)
    expect(isLaundryTaskName('Wash windows')).toBe(false)
    expect(isLaundryTaskName('Environment check')).toBe(false)
  })

  it('pre-picks a service only when the name names exactly one', () => {
    expect(laundryServiceFromName('Wash clothes')).toBe('wash')
    expect(laundryServiceFromName('Dry laundry')).toBe('dry')
    expect(laundryServiceFromName('Fold laundry')).toBe('fold')
    expect(laundryServiceFromName('Ironing')).toBe('iron')
    expect(laundryServiceFromName('Wash and dry laundry')).toBe('washDry')
    expect(laundryServiceFromName('Laundry')).toBeNull()
    expect(laundryServiceFromName('Wash and fold laundry')).toBeNull()
  })
})

describe('laundry quantities', () => {
  it('accepts basket counts in half-basket steps', () => {
    for (const n of [0.5, 1, 1.5, 2, 10]) expect(isValidBasketCount(n)).toBe(true)
    for (const n of [0, 0.25, 1.2, 10.5, NaN, '1']) expect(isValidBasketCount(n)).toBe(false)
  })

  it('accepts positive whole ironing counts', () => {
    expect(isValidIronItemCount(1)).toBe(true)
    for (const n of [0, -1, 1.5, 100, null]) expect(isValidIronItemCount(n)).toBe(false)
  })

  it('formats baskets for people', () => {
    expect(formatBaskets(0.5)).toBe('Half a basket')
    expect(formatBaskets(1)).toBe('1 basket')
    expect(formatBaskets(2.5)).toBe('2.5 baskets')
  })

  it('labels a task with its service and quantity, and copes with missing quantity', () => {
    expect(laundryDetailLabel({ laundryService: 'wash', laundryBaskets: 1.5 })).toBe('Wash · 1.5 baskets')
    expect(laundryDetailLabel({ laundryService: 'iron', ironItems: 4 })).toBe('Iron · 4 items')
    expect(laundryDetailLabel({ laundryService: 'washDry', laundryBaskets: 1 })).toBe('Wash & dry · 1 basket')
    expect(laundryDetailLabel({ laundryService: 'dry' })).toBe('Dry')
    expect(laundryDetailLabel({})).toBeNull()
  })

  it('only allows full wash & dry cycles at a laundromat', () => {
    expect(isLaundromatPartialCycle({ laundryService: 'wash', hasWasherDryer: false })).toBe(true)
    expect(isLaundromatPartialCycle({ laundryService: 'dry', hasWasherDryer: false })).toBe(true)
    expect(isLaundromatPartialCycle({ laundryService: 'washDry', hasWasherDryer: false })).toBe(false)
    // Home machines, or older tasks never asked, can start a load.
    expect(isLaundromatPartialCycle({ laundryService: 'wash', hasWasherDryer: true })).toBe(false)
    expect(isLaundromatPartialCycle({ laundryService: 'dry' })).toBe(false)
    expect(isLaundromatPartialCycle({ laundryService: 'fold', hasWasherDryer: false })).toBe(false)
  })

  it('marks a laundromat trip only when the customer said they have no washer and dryer', () => {
    expect(usesLaundromat({ laundryService: 'washDry', hasWasherDryer: false })).toBe(true)
    expect(usesLaundromat({ laundryService: 'wash', hasWasherDryer: true })).toBe(false)
    // Older tasks never asked: treated as home machines.
    expect(usesLaundromat({ laundryService: 'dry' })).toBe(false)
    // Folding and ironing don't need machines.
    expect(usesLaundromat({ laundryService: 'fold', hasWasherDryer: false })).toBe(false)
    expect(laundryDetailLabel({ laundryService: 'wash', laundryBaskets: 1, hasWasherDryer: false })).toBe(
      'Wash · 1 basket · At a laundromat'
    )
  })

  it('names booked tasks with the quantity for the Tidy Pro', () => {
    expect(bookedTaskName({ name: 'Fold clothes', room: 'Bedroom', laundryService: 'fold', laundryBaskets: 0.5 })).toBe(
      'Fold clothes (Fold · Half a basket)'
    )
    expect(bookedTaskName({ name: 'Wipe counters', room: 'Kitchen' })).toBe('Wipe counters')
  })
})

describe('machine loads', () => {
  it('shows baskets and loads separately', () => {
    expect(laundryDetailLabel({ laundryService: 'washDry', laundryBaskets: 1, machineLoads: 3 })).toBe('Wash & dry · 1 basket · 3 loads')
    // Wash or Dry only is always one load, so no count is shown.
    expect(laundryDetailLabel({ laundryService: 'wash', laundryBaskets: 1, machineLoads: 3 })).toBe('Wash · 1 basket')
    expect(laundryDetailLabel({ laundryService: 'fold', laundryBaskets: 1, machineLoads: 3 })).toBe('Fold · 1 basket')
    expect(
      laundryDetailLabel({ laundryService: 'dry', laundryBaskets: 1, machineLoads: 1, sameLaundryAsTaskId: 'w' })
    ).toBe('Dry · 1 basket · Same laundry as Wash')
  })

  it('counts each linked pair once, as one load', () => {
    const tasks = [
      { id: 'w', laundryService: 'wash' as const, laundryBaskets: 1, machineLoads: 3, sameLaundryAsTaskId: 'd' },
      { id: 'd', laundryService: 'dry' as const, laundryBaskets: 1, machineLoads: 2, sameLaundryAsTaskId: 'w' },
    ]
    expect(pairedMachineLoads(tasks)).toBe(1)
    expect(linkableLaundryTasks('dry', tasks)).toEqual([])
    expect(dropUnmatchedLaundryLinks([tasks[0]])[0].sameLaundryAsTaskId).toBeNull()
  })

  it('formats the visit length', () => {
    expect(formatVisitDuration(360)).toBe('6 hr')
    expect(formatVisitDuration(247)).toBe('4 hr 7 min')
    expect(formatVisitDuration(45)).toBe('45 min')
  })
})

describe('Wash or Dry only: start the load', () => {
  it('asks about one machine, or both for linked laundry', () => {
    expect(startOnlyQuestion('wash', false)).toBe('Should your Tidy Pro only put a load in the washer, without taking it out?')
    expect(startOnlyQuestion('dry', false)).toBe('Should your Tidy Pro only put a load in the dryer, without taking it out?')
    expect(startOnlyQuestion('dry', true)).toContain('a load in the washer and a load in the dryer')
  })

  it('tells the customer the task is now Wash & dry, naming the linked task it replaces', () => {
    expect(switchedToWashDryMessage(null)).toContain('This is now a Wash & dry task')
    expect(switchedToWashDryMessage(null)).toContain('Please fill in the booking details.')
    expect(switchedToWashDryMessage({ label: 'Wash', name: 'Wash towels' })).toContain('It replaces your Wash task (Wash towels)')
  })

  it('renames a wash-only or dry-only task name for Wash & dry', () => {
    expect(washDryTaskName('Wash towels')).toBe('Wash & dry laundry')
    expect(washDryTaskName('Dry clothes')).toBe('Wash & dry laundry')
    expect(washDryTaskName('Laundry')).toBe('Laundry')
  })
})
