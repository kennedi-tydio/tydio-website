import { describe, expect, it } from 'vitest'
import { customerSmsPhoneUpdate, isSamePhone, textingPhone } from './smsPhone'

describe('textingPhone', () => {
  it('prefers the texting number, then the profile phone', () => {
    expect(textingPhone({ phone: '4045550100', sms_phone: '+12025550123' })).toBe('+12025550123')
    expect(textingPhone({ phone: '4045550100', sms_phone: null })).toBe('4045550100')
    expect(textingPhone({ phone: '4045550100' })).toBe('4045550100')
    expect(textingPhone({ phone: null, sms_phone: null })).toBeNull()
    expect(textingPhone(null)).toBeNull()
  })
})

describe('isSamePhone', () => {
  it('ignores formatting and a leading US +1', () => {
    expect(isSamePhone('(404) 555-0100', '+14045550100')).toBe(true)
    expect(isSamePhone('4045550100', '+12025550123')).toBe(false)
    expect(isSamePhone(null, '4045550100')).toBe(false)
  })
})

describe('customerSmsPhoneUpdate', () => {
  it('saves the number as the profile phone when there is none', () => {
    expect(customerSmsPhoneUpdate(null, '+12025550123')).toEqual({ phone: '+12025550123', sms_phone: null })
    expect(customerSmsPhoneUpdate('  ', '+12025550123')).toEqual({ phone: '+12025550123', sms_phone: null })
  })

  it('keeps the profile phone and saves a different number for texts', () => {
    expect(customerSmsPhoneUpdate('4045550100', '+12025550123')).toEqual({ sms_phone: '+12025550123' })
  })

  it('clears the texting number when it matches the profile phone', () => {
    expect(customerSmsPhoneUpdate('(404) 555-0100', '+14045550100')).toEqual({ sms_phone: null })
  })
})
