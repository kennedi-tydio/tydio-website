// Strips formatting so "+1 (555) 123-4567", "555-123-4567", and "5551234567" all
// compare as the same number. Kept on its own (re-exported from lib/bannedUsers)
// so phone helpers can use it without loading the email code.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}
