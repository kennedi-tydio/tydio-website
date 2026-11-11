import { describe, expect, it } from 'vitest'
import {
  hasChosenServices,
  normalizeServices,
  providesServices,
  requiredServiceForTask,
  requiredServicesForTasks,
  serviceLabels,
} from './tidyProServices'

describe('tidy pro services', () => {
  it('keeps known services once, in list order', () => {
    expect(normalizeServices(['litterBoxes', 'taskBased', 'bogus', 'taskBased'])).toEqual(['taskBased', 'litterBoxes'])
    expect(normalizeServices(null)).toEqual([])
    expect(normalizeServices('laundry')).toEqual([])
  })

  it('counts as chosen only with at least one real service', () => {
    expect(hasChosenServices(['laundromat'])).toBe(true)
    // No longer offered, so it doesn't count.
    expect(hasChosenServices(['dryCleaning'])).toBe(false)
    expect(hasChosenServices([])).toBe(false)
    expect(hasChosenServices(null)).toBe(false)
  })

  it('labels the chosen services', () => {
    expect(serviceLabels(['laundromat', 'petEnclosures'])).toEqual(['Laundromat trips', 'Pet enclosures'])
  })
})

describe('services a booking needs', () => {
  const task = (fields: Record<string, unknown> = {}) =>
    ({ name: 'x', room: 'Kitchen', ...fields }) as Parameters<typeof requiredServiceForTask>[0]

  it('maps each task to the service it needs', () => {
    expect(requiredServiceForTask(task())).toBe('taskBased')
    expect(requiredServiceForTask(task({ hasDishwasher: true }))).toBe('taskBased')
    expect(requiredServiceForTask(task({ laundryService: 'fold' }))).toBe('laundry')
    expect(requiredServiceForTask(task({ laundryService: 'wash', hasWasherDryer: true }))).toBe('laundry')
    expect(requiredServiceForTask(task({ laundryService: 'wash', hasWasherDryer: false }))).toBe('laundromat')
    expect(requiredServiceForTask(task({ laundryLoads: { wash: 1, dry: 0, fold: 0 } }))).toBe('laundry')
    expect(requiredServiceForTask(task({ pet: { kind: 'enclosure', scope: '', photos: [] } }))).toBe('petEnclosures')
    expect(requiredServiceForTask(task({ pet: { kind: 'litterBox', scope: '', photos: [] } }))).toBe('litterBoxes')
  })

  it('lists each needed service once', () => {
    expect(requiredServicesForTasks([task(), task(), task({ pet: { kind: 'litterBox', scope: '', photos: [] } })])).toEqual([
      'taskBased',
      'litterBoxes',
    ])
  })

  it('requires a Tidy Pro to provide all of them', () => {
    expect(providesServices(['taskBased', 'litterBoxes'], ['taskBased', 'litterBoxes'])).toBe(true)
    expect(providesServices(['taskBased'], ['taskBased', 'litterBoxes'])).toBe(false)
    expect(providesServices(null, ['taskBased'])).toBe(false)
  })
})
