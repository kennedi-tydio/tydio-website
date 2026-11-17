import { describe, expect, it } from 'vitest'
import { tipEmailHtml, tipEmailSubject } from './tipEmail'

describe('tip email', () => {
  it('puts the amount in the subject', () => {
    expect(tipEmailSubject(10)).toBe('You received a $10.00 tip!')
  })

  it('shows the amount, encouragement and booking link', () => {
    const html = tipEmailHtml({ firstName: 'Sam', amount: 12.5, bookingId: 'abc-123' })
    expect(html).toContain('You received a tip!')
    expect(html).toContain('$12.50')
    expect(html).toContain('Keep up the great work!')
    expect(html).toContain('/pro/bookings/abc-123')
    expect(html).toContain('Hi Sam,')
  })

  it('escapes the name', () => {
    expect(tipEmailHtml({ firstName: '<b>x</b>', amount: 1, bookingId: 'b' })).toContain('Hi &lt;b&gt;x&lt;/b&gt;,')
  })
})
