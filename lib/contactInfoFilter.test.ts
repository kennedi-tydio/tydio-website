import { describe, expect, it } from 'vitest'
import { detectContactInfo } from './contactInfoFilter'

describe('detectContactInfo', () => {
  it.each([
    'call me at 404-555-1234',
    'my number is (404) 555 1234',
    '404.555.1234',
    '4045551234',
    '+1 404 555 1234',
    '4 0 4 5 5 5 1 2 3 4',
    'four oh four five five five one two three four',
    'text me 555-1234',
  ])('blocks the phone number in %j', (text) => {
    expect(detectContactInfo(text)).toBe('phone')
  })

  it.each([
    'email me at jane.doe@gmail.com',
    'jane @ gmail . com',
    'jane at gmail dot com',
    'jane(at)example(dot)com',
    'janedoe at yahoo',
  ])('blocks the email address in %j', (text) => {
    expect(detectContactInfo(text)).toBe('email')
  })

  it.each([
    'See you at 10:30! Should be done by 12:30.',
    'Booked for 11/14/2026, gate code is 4821',
    'I have two dogs and one cat',
    'The house is at 1234 Peachtree St, 30303',
    'Did you check your gmail?',
    'I will be there at 9, done at 11',
    'That was $1,250 total',
    '',
  ])('allows %j', (text) => {
    expect(detectContactInfo(text)).toBeNull()
  })
})
