// Tydio only operates in Georgia for now. Signups outside Georgia go on the
// waitlist (app/(auth)/signup/actions.ts) and never get the welcome email.
export function isGeorgiaZip(zip: string | null | undefined): boolean {
  if (!zip || !/^\d{5}$/.test(zip)) return false
  const n = parseInt(zip, 10)
  return (n >= 30001 && n <= 31999) || (n >= 39800 && n <= 39901)
}
