import { describe, expect, it } from 'vitest'
import { emptySelection } from './fullService'
import { canPerform, ratesRowFromInput, resolveRates, unpricedFullServices } from './fullServiceRates'

const blank = { standard_base_take_home: null, deep_base_take_home: null, standard_room_percents: {}, deep_room_percents: {}, add_ons: {} }

describe('resolveRates', () => {
  it('fills in Tydio’s default room percentages and add-on prices', () => {
    const rates = resolveRates({ ...blank, standard_base_take_home: '150.00' })
    expect(rates.standard).toEqual({
      baseTakeHome: 150,
      roomPercents: { kitchen: 30, full_bath: 20, half_bath: 10, bedroom: 15, living_room: 20, dining_room: 10, home_office: 10, hallway: 5 },
    })
    expect(rates.deep).toBeNull()
    expect(rates.addOns.inside_fridge).toEqual({ enabled: true, takeHome: 36 })
  })

  it('applies only valid overrides', () => {
    const rates = resolveRates({ ...blank, standard_base_take_home: 150, standard_room_percents: { full_bath: 25, kitchen: 0, attic: 40, bedroom: 'x' } })
    expect(rates.standard?.roomPercents.full_bath).toBe(25)
    expect(rates.standard?.roomPercents.kitchen).toBe(30)
    expect(rates.standard?.roomPercents.bedroom).toBe(15)
  })

  it('treats a missing row or an out-of-range base as unpriced', () => {
    expect(resolveRates(null).standard).toBeNull()
    expect(resolveRates({ ...blank, standard_base_take_home: 5 }).standard).toBeNull()
  })
})

describe('canPerform', () => {
  const rates = resolveRates({ ...blank, standard_base_take_home: 150, add_ons: { inside_oven: { enabled: false } } })

  it('needs the service priced', () => {
    expect(canPerform(rates, emptySelection('standard'))).toBe(true)
    expect(canPerform(rates, emptySelection('deep'))).toBe(false)
  })

  it('needs every chosen add-on offered', () => {
    expect(canPerform(rates, { ...emptySelection('standard'), addOns: { inside_fridge: 1 } })).toBe(true)
    expect(canPerform(rates, { ...emptySelection('standard'), addOns: { inside_oven: 1 } })).toBe(false)
  })
})

describe('unpricedFullServices', () => {
  it('lists offered full-service services without a base price', () => {
    const rates = resolveRates({ ...blank, standard_base_take_home: 150 })
    expect(unpricedFullServices(['taskBased', 'standardCleaning', 'deepCleaning'], rates)).toEqual(['deep'])
    expect(unpricedFullServices(['taskBased'], rates)).toEqual([])
    // The retired "general cleaning" counts as both.
    expect(unpricedFullServices(['generalCleaning'], resolveRates(null))).toEqual(['standard', 'deep'])
  })
})

describe('ratesRowFromInput', () => {
  const input = {
    standardBaseTakeHome: 160,
    deepBaseTakeHome: null,
    standardRoomPercents: { kitchen: 30, full_bath: 25 },
    deepRoomPercents: {},
    addOns: { inside_fridge: { enabled: true, takeHome: 36 }, inside_oven: { enabled: true, takeHome: 40 }, inside_freezer: { enabled: false, takeHome: 20 } },
  }

  it('stores only what differs from the defaults', () => {
    expect(ratesRowFromInput(input).row).toEqual({
      standard_base_take_home: 160,
      deep_base_take_home: null,
      standard_room_percents: { full_bath: 25 },
      deep_room_percents: {},
      // The freezer's $20 is Tydio's default take-home, so it isn't stored.
      add_ons: { inside_oven: { enabled: true, take_home: 40 }, inside_freezer: { enabled: false, take_home: null } },
    })
  })

  it('keeps a room price typed in dollars as an exact percentage', () => {
    // $50 on a $160 whole home is 31.25%.
    expect(ratesRowFromInput({ ...input, standardRoomPercents: { kitchen: 31.25 } }).row?.standard_room_percents).toEqual({ kitchen: 31.25 })
    expect(resolveRates({ ...blank, standard_base_take_home: 160, standard_room_percents: { kitchen: 31.25 } }).standard?.roomPercents.kitchen).toBe(31.25)
  })

  it('rejects out-of-range values', () => {
    expect(ratesRowFromInput({ ...input, standardBaseTakeHome: 5 }).error).toMatch(/between/)
    expect(ratesRowFromInput({ ...input, standardRoomPercents: { kitchen: 150 } }).error).toMatch(/room price/)
    expect(ratesRowFromInput({ ...input, standardRoomPercents: { kitchen: 0 } }).error).toMatch(/room price/)
    expect(ratesRowFromInput({ ...input, addOns: { inside_oven: { enabled: true, takeHome: 0 } } }).error).toMatch(/Add-on/)
  })
})
