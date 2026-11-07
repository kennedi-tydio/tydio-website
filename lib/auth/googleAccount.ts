import type { createAdminClient } from '@/lib/supabase/admin'
import { isBanned } from '@/lib/bannedUsers'
import type { GoogleIdentity, SignInRole } from '@/lib/auth/google'

type Admin = ReturnType<typeof createAdminClient>

export type SignInProfile = { id: string; role: 'USER' | 'TIDYPRO' | 'ADMIN'; email: string }

export type GoogleSignInOutcome =
  | { kind: 'signed_in'; profile: SignInProfile }
  | { kind: 'needs_signup' }
  | { kind: 'banned' }
  | { kind: 'linked_elsewhere' }

// Works out which Tydio account a verified Google identity belongs to, in this order:
//   1. a profile of this role already linked to this Google account;
//   2. a profile of this role with the same email, which gets linked now;
//   3. nobody, so the person finishes signing up.
// Roles stay separate, as with passwords: signing in as a Tidy Pro never lands
// in the customer account with the same email.
export async function resolveGoogleSignIn(
  admin: Admin,
  identity: GoogleIdentity,
  role: SignInRole,
): Promise<GoogleSignInOutcome> {
  if (await isBanned(admin, { email: identity.email })) return { kind: 'banned' }

  const now = new Date().toISOString()

  const { data: links } = await admin
    .from('auth_identities')
    .select('profile_id')
    .eq('provider', 'google')
    .eq('provider_user_id', identity.sub)
  const linkedIds = (links ?? []).map((l) => l.profile_id)

  if (linkedIds.length > 0) {
    const { data: linked } = await admin
      .from('profiles')
      .select('id, role, email, phone, banned_at')
      .in('id', linkedIds)
      .eq('role', role)
      .maybeSingle()
    if (linked) {
      if (linked.banned_at || (await isBanned(admin, { email: linked.email, phone: linked.phone }))) {
        return { kind: 'banned' }
      }
      await admin
        .from('auth_identities')
        .update({ last_used_at: now })
        .eq('provider', 'google')
        .eq('provider_user_id', identity.sub)
        .eq('profile_id', linked.id)
      return { kind: 'signed_in', profile: { id: linked.id, role: linked.role as SignInProfile['role'], email: linked.email } }
    }
  }

  const { data: byEmail } = await admin
    .from('profiles')
    .select('id, role, email, phone, banned_at, email_verified_at')
    .eq('email', identity.email)
    .eq('role', role)
    .maybeSingle()

  if (!byEmail) return { kind: 'needs_signup' }

  if (byEmail.banned_at || (await isBanned(admin, { phone: byEmail.phone }))) return { kind: 'banned' }

  // The account already has a different Google account connected; don't swap it silently.
  const { data: otherLink } = await admin
    .from('auth_identities')
    .select('id')
    .eq('profile_id', byEmail.id)
    .eq('provider', 'google')
    .maybeSingle()
  if (otherLink) return { kind: 'linked_elsewhere' }

  await linkGoogleIdentity(admin, byEmail.id, identity)

  if (!byEmail.email_verified_at) {
    // Google has just proved this person owns the email, which the account
    // itself never did. Someone else could have signed up with their address
    // and a password of their own, so that password goes; the owner can set a
    // new one with "Forgot password".
    await admin.from('profiles').update({ email_verified_at: now, password_hash: null }).eq('id', byEmail.id)
  }

  return { kind: 'signed_in', profile: { id: byEmail.id, role: byEmail.role as SignInProfile['role'], email: byEmail.email } }
}

export async function linkGoogleIdentity(admin: Admin, profileId: string, identity: GoogleIdentity): Promise<void> {
  const { error } = await admin.from('auth_identities').insert({
    profile_id: profileId,
    provider: 'google',
    provider_user_id: identity.sub,
    email: identity.email,
    last_used_at: new Date().toISOString(),
  })
  if (error) throw new Error(`Linking Google account failed: ${error.message}`)
}

export async function hasGoogleIdentity(admin: Admin, profileId: string): Promise<boolean> {
  const { data } = await admin
    .from('auth_identities')
    .select('id')
    .eq('profile_id', profileId)
    .eq('provider', 'google')
    .maybeSingle()
  return Boolean(data)
}
