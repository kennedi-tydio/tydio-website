import { describe, expect, it } from 'vitest'
import { MAX_ENTRY_INSTRUCTIONS_LENGTH, normalizeEntryInstructions } from './entryInstructions'

describe('normalizeEntryInstructions', () => {
  it('trims and treats blank as none', () => {
    expect(normalizeEntryInstructions('  Code 1234  ')).toBe('Code 1234')
    expect(normalizeEntryInstructions('   ')).toBeNull()
    expect(normalizeEntryInstructions(null)).toBeNull()
  })

  it('caps the length', () => {
    expect(normalizeEntryInstructions('x'.repeat(MAX_ENTRY_INSTRUCTIONS_LENGTH + 20))).toHaveLength(MAX_ENTRY_INSTRUCTIONS_LENGTH)
  })
})
