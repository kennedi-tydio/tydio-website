import { describe, expect, it } from 'vitest'
import {
  BackgroundCheckStateError,
  backgroundCheckStage,
  backgroundCheckStatusLabel,
  isBackgroundCheckStepDone,
  isBackgroundCheckSubmitted,
  isPastBackgroundCheckScreens,
  parseBackgroundCheckLink,
  shouldShowVerifiedScreen,
} from './backgroundCheck'

const at = '2026-11-02T10:00:00Z'
const base = { status: 'pending', requested_at: null, link_sent_at: null, submitted_at: null }
const notPaid = base
const requested = { ...base, requested_at: at }
const linkSent = { ...requested, link_sent_at: at }
const submitted = { ...linkSent, submitted_at: at }
const inReview = { ...submitted, status: 'in_review' }
const passed = { ...submitted, status: 'passed' }
const failed = { ...submitted, status: 'failed' }

describe('backgroundCheckStage', () => {
  it('walks through each stage in order', () => {
    expect(backgroundCheckStage(null)).toBe('not_started')
    expect(backgroundCheckStage(notPaid)).toBe('not_started')
    expect(backgroundCheckStage(requested)).toBe('needs_link')
    expect(backgroundCheckStage(linkSent)).toBe('link_sent')
    expect(backgroundCheckStage(submitted)).toBe('pending')
    expect(backgroundCheckStage(passed)).toBe('passed')
    expect(backgroundCheckStage(failed)).toBe('failed')
  })

  it('keeps a check flagged for review in pending', () => {
    expect(backgroundCheckStage(inReview)).toBe('pending')
  })
})

describe('isBackgroundCheckSubmitted', () => {
  it('is false until the form is recorded as submitted, even with the link sent', () => {
    expect(isBackgroundCheckSubmitted(null)).toBe(false)
    expect(isBackgroundCheckSubmitted(requested)).toBe(false)
    expect(isBackgroundCheckSubmitted(linkSent)).toBe(false)
  })

  it('is true once submitted, and for every outcome', () => {
    expect(isBackgroundCheckSubmitted(submitted)).toBe(true)
    for (const status of ['in_review', 'passed', 'failed']) {
      expect(isBackgroundCheckSubmitted({ ...base, status })).toBe(true)
    }
  })
})

describe('backgroundCheckStatusLabel', () => {
  it('only says Pending once the form has been submitted', () => {
    expect(backgroundCheckStatusLabel(requested)).toBe('Form coming')
    expect(backgroundCheckStatusLabel(linkSent)).toBe('Form sent')
    expect(backgroundCheckStatusLabel(submitted)).toBe('Pending')
    expect(backgroundCheckStatusLabel(inReview)).toBe('Pending')
  })

  it('reports an outcome', () => {
    expect(backgroundCheckStatusLabel(passed)).toBe('Passed')
    expect(backgroundCheckStatusLabel(failed)).toBe('Not passed')
  })
})

describe('shouldShowVerifiedScreen', () => {
  const approved = { cleaner_status: 'approved', verified_ack_at: null }

  it('shows after passing, until acknowledged', () => {
    expect(shouldShowVerifiedScreen(approved, passed)).toBe(true)
    expect(shouldShowVerifiedScreen({ ...approved, verified_ack_at: at }, passed)).toBe(false)
  })

  it('does not show for an approval without a passed check', () => {
    for (const check of [null, requested, linkSent, submitted, inReview, failed]) {
      expect(shouldShowVerifiedScreen(approved, check)).toBe(false)
    }
  })

  it('does not show to a cleaner who has since been paused', () => {
    expect(shouldShowVerifiedScreen({ cleaner_status: 'paused', verified_ack_at: null }, passed)).toBe(false)
  })
})

describe('isPastBackgroundCheckScreens', () => {
  it('is true once passed or approved', () => {
    expect(isPastBackgroundCheckScreens('applied', passed)).toBe(true)
    expect(isPastBackgroundCheckScreens('approved', null)).toBe(true)
  })

  it('is false while still waiting on a decision', () => {
    expect(isPastBackgroundCheckScreens('applied', null)).toBe(false)
    expect(isPastBackgroundCheckScreens('applied', requested)).toBe(false)
    expect(isPastBackgroundCheckScreens('applied', submitted)).toBe(false)
    expect(isPastBackgroundCheckScreens('applied', inReview)).toBe(false)
  })
})

describe('isBackgroundCheckStepDone', () => {
  it('holds a cleaner at the step until they pay or request', () => {
    expect(isBackgroundCheckStepDone('applied', null)).toBe(false)
    expect(isBackgroundCheckStepDone('applied', notPaid)).toBe(false)
    expect(isBackgroundCheckStepDone('applied', requested)).toBe(true)
  })

  it('lets an admin-approved cleaner through without a check', () => {
    expect(isBackgroundCheckStepDone('approved', null)).toBe(true)
  })
})

describe('parseBackgroundCheckLink', () => {
  it('accepts an https link and treats blank as no link', () => {
    expect(parseBackgroundCheckLink(' https://apply.checkr.com/abc ')).toBe('https://apply.checkr.com/abc')
    expect(parseBackgroundCheckLink('')).toBeNull()
    expect(parseBackgroundCheckLink(null)).toBeNull()
  })

  it('rejects anything else', () => {
    expect(() => parseBackgroundCheckLink('http://apply.checkr.com/abc')).toThrow(BackgroundCheckStateError)
    expect(() => parseBackgroundCheckLink('javascript:alert(1)')).toThrow(BackgroundCheckStateError)
    expect(() => parseBackgroundCheckLink('not a url')).toThrow(BackgroundCheckStateError)
  })
})
