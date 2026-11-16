import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_REPORT_CATEGORIES,
  TIDY_PRO_REPORT_CATEGORIES,
  countBySeverity,
  findReportChoice,
  parseReportInput,
  reachesBanThreshold,
  reportDescription,
  reportSeverity,
} from './reportCategories'

describe('parseReportInput', () => {
  it('accepts a reason with no note', () => {
    const result = parseReportInput(TIDY_PRO_REPORT_CATEGORIES, 'arrival_attendance', 'late', '   ')
    expect(result).toEqual({ choice: expect.objectContaining({ reason: expect.objectContaining({ id: 'late', label: 'Cleaner is late' }) }), details: '' })
  })

  it('keeps an optional note, trimmed', () => {
    const result = parseReportInput(CUSTOMER_REPORT_CATEGORIES, 'payout_payment', 'tip_issue', '  Tip never arrived ')
    expect('details' in result && result.details).toBe('Tip never arrived')
  })

  it('requires a reason from the chosen category', () => {
    expect(parseReportInput(TIDY_PRO_REPORT_CATEGORIES, 'arrival_attendance', null, '')).toEqual({ error: 'Please choose what happened.' })
    expect(parseReportInput(TIDY_PRO_REPORT_CATEGORIES, 'arrival_attendance', 'refund_issue', '')).toEqual({ error: 'Please choose what happened.' })
  })

  it('rejects a category from the other side’s list', () => {
    expect(parseReportInput(TIDY_PRO_REPORT_CATEGORIES, 'payout_payment', 'tip_issue', '')).toEqual({ error: 'Please choose what the issue is about.' })
  })

  it('needs a description for Something else', () => {
    expect(parseReportInput(CUSTOMER_REPORT_CATEGORIES, 'other', null, ' ')).toEqual({ error: 'Please describe what happened.' })
    expect('details' in parseReportInput(CUSTOMER_REPORT_CATEGORIES, 'other', null, 'Locked gate')).toBe(true)
  })
})

describe('reportDescription', () => {
  it('names the category and reason, then the note', () => {
    const result = parseReportInput(TIDY_PRO_REPORT_CATEGORIES, 'damage_missing', 'damaged', 'Cracked vase')
    if ('error' in result) throw new Error(result.error)
    expect(reportDescription(result.choice, result.details)).toBe('Damage or missing items: Something was damaged — Cracked vase')
  })
})

describe('reportSeverity', () => {
  it('comes from the reason, and Something else starts low', () => {
    expect(reportSeverity(findReportChoice(TIDY_PRO_REPORT_CATEGORIES, 'safety_behavior', 'felt_unsafe')!)).toBe('high')
    expect(reportSeverity(findReportChoice(CUSTOMER_REPORT_CATEGORIES, 'safety_behavior', 'unsafe_pet')!)).toBe('medium')
    expect(reportSeverity(findReportChoice(TIDY_PRO_REPORT_CATEGORIES, 'arrival_attendance', 'late')!)).toBe('low')
    expect(reportSeverity(findReportChoice(CUSTOMER_REPORT_CATEGORIES, 'other', null)!)).toBe('low')
  })
})

describe('reachesBanThreshold', () => {
  it('is reached at 3 low, 2 mid, or 1 high', () => {
    expect(reachesBanThreshold(countBySeverity(['low', 'low', 'low']))).toBe(true)
    expect(reachesBanThreshold(countBySeverity(['medium', 'medium']))).toBe(true)
    expect(reachesBanThreshold(countBySeverity(['high']))).toBe(true)
  })

  it('counts each level on its own', () => {
    expect(reachesBanThreshold(countBySeverity(['low', 'low', 'medium']))).toBe(false)
    expect(reachesBanThreshold(countBySeverity([]))).toBe(false)
  })

  it('counts critical as high and anything unknown as low', () => {
    expect(countBySeverity(['critical', 'weird', null])).toEqual({ low: 2, medium: 0, high: 1 })
  })
})
