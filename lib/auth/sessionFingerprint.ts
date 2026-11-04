import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// A session is only good while the account still exists, isn't banned, and has
// the password it was signed in with: resetting the password or a ban ends every
// other session. (A suspension doesn't: a suspended person can still sign in.) The token
// carries this fingerprint of the password hash, never the hash itself.
export function passwordFingerprint(passwordHash: string | null): string {
  return createHash('sha256').update(passwordHash ?? 'no-password').digest('hex').slice(0, 16)
}

// null when the profile no longer exists or is banned.
export async function currentFingerprint(profileId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('profiles')
    .select('password_hash, banned_at')
    .eq('id', profileId)
    .maybeSingle()
  return data && !data.banned_at ? passwordFingerprint(data.password_hash) : null
}

export async function isSessionCurrent(payload: { profileId?: string; pv?: string }): Promise<boolean> {
  if (!payload.profileId || !payload.pv) return false
  return payload.pv === (await currentFingerprint(payload.profileId))
}
