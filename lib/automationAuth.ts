import crypto from 'node:crypto'

// Guards the routes an outside automation calls. With no key configured these
// routes refuse everything, rather than falling open.
export function isAutomationAuthorized(authorizationHeader: string | null, key: string | undefined = process.env.BACKGROUND_CHECK_AUTOMATION_KEY): boolean {
  if (!key || !authorizationHeader) return false
  // Hashed first so the comparison is constant-time whatever the input's length.
  const hash = (value: string) => crypto.createHash('sha256').update(value).digest()
  return crypto.timingSafeEqual(hash(authorizationHeader), hash(`Bearer ${key}`))
}
