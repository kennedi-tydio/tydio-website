import { describe, expect, it } from 'vitest'
import { DECLINE_REASONS, declineReasonLabel, parseDecline } from './declineReasons'

describe('parseDecline', () => {
  it('keeps a trimmed note for Other', () => {
    expect(parseDecline({ reason: 'other', note: '  pet allergy  ' })).toEqual({ reason: 'other', note: 'pet allergy' })
  })

  it('drops the note for every other reason', () => {
    expect(parseDecline({ reason: 'too_far', note: 'about 40 minutes' })).toEqual({ reason: 'too_far', note: null })
  })

  it('treats a blank Other note as none', () => {
    expect(parseDecline({ reason: 'other', note: '   ' })).toEqual({ reason: 'other', note: null })
  })

  it('needs a reason from the decline list', () => {
    expect(parseDecline(null)).toEqual({ error: 'Please choose a reason for declining.' })
    expect(parseDecline({ reason: 'sick_or_emergency' })).toEqual({ error: 'Please choose a reason for declining.' })
  })

  it('rejects an overlong note', () => {
    expect(parseDecline({ reason: 'other', note: 'x'.repeat(501) })).toHaveProperty('error')
  })
})

describe('declineReasonLabel', () => {
  it('labels every reason', () => {
    for (const r of DECLINE_REASONS) expect(declineReasonLabel(r.id)).toBe(r.label)
    expect(declineReasonLabel(null)).toBeNull()
  })
})
