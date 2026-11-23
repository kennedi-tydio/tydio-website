import { describe, expect, it } from 'vitest'
import { isHiddenFromCustomer } from './privateTidyPros'

const KENNEDI_PRO = '26c6fa0a-3fff-4d86-97b5-340400c8d93d'
const TEST_PRO = '853ac2a7-a148-4521-bf4a-b250319abc8e'
const KENNEDI_CUSTOMER = 'df53cdfe-4ccf-4e13-a52f-19af0727ea33'

describe('isHiddenFromCustomer', () => {
  it('shows private Tidy Pros to their allowed customer', () => {
    expect(isHiddenFromCustomer(KENNEDI_PRO, KENNEDI_CUSTOMER)).toBe(false)
    expect(isHiddenFromCustomer(TEST_PRO, KENNEDI_CUSTOMER)).toBe(false)
  })

  it('hides them from every other customer, and when there is no customer', () => {
    expect(isHiddenFromCustomer(KENNEDI_PRO, 'someone-else')).toBe(true)
    expect(isHiddenFromCustomer(TEST_PRO, 'someone-else')).toBe(true)
    expect(isHiddenFromCustomer(KENNEDI_PRO, null)).toBe(true)
    expect(isHiddenFromCustomer(KENNEDI_PRO, undefined)).toBe(true)
  })

  it('leaves every other Tidy Pro visible', () => {
    expect(isHiddenFromCustomer('any-other-pro', 'someone-else')).toBe(false)
    expect(isHiddenFromCustomer('any-other-pro', null)).toBe(false)
    expect(isHiddenFromCustomer(null, 'someone-else')).toBe(false)
  })
})
