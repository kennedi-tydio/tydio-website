import { describe, expect, it } from 'vitest'
import { BUG_REPORT_CATEGORIES, bugReportCategoriesFor } from './bugReportCategories'

describe('bugReportCategoriesFor', () => {
  it('shows customers checkout but none of the Tidy Pro topics', () => {
    const ids = bugReportCategoriesFor('USER').map((c) => c.id)
    expect(ids).toContain('checkout')
    expect(ids).not.toContain('pro_settings')
    expect(ids).not.toContain('onboarding')
    expect(ids).not.toContain('earnings')
    expect(ids).toHaveLength(11)
  })

  it('shows Tidy Pros their topics but not checkout', () => {
    const ids = bugReportCategoriesFor('TIDYPRO').map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining(['pro_settings', 'onboarding', 'earnings']))
    expect(ids).not.toContain('checkout')
    expect(ids).toHaveLength(13)
  })

  it('keeps the list order and ends with Something else', () => {
    expect(bugReportCategoriesFor('USER').at(-1)?.id).toBe('other')
    expect(new Set(BUG_REPORT_CATEGORIES.map((c) => c.id)).size).toBe(BUG_REPORT_CATEGORIES.length)
  })
})
