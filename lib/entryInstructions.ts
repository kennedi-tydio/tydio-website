export const MAX_ENTRY_INSTRUCTIONS_LENGTH = 500

// Trimmed and capped; blank means none.
export function normalizeEntryInstructions(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().slice(0, MAX_ENTRY_INSTRUCTIONS_LENGTH)
  return trimmed || null
}
