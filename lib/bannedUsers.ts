import type { createAdminClient } from '@/lib/supabase/admin'
import { TYDIO_ADMIN_EMAIL } from '@/lib/email'

type Admin = ReturnType<typeof createAdminClient>

export const BANNED_MESSAGE = `You are banned from Tydio. If you think this is a mistake, please email ${TYDIO_ADMIN_EMAIL}.`

import { normalizePhone } from '@/lib/normalizePhone'

export { normalizePhone }

// Checked wherever someone authenticates. A match on either value is enough, so a
// new email can't get round a ban on the same phone number, or the reverse.
export async function isBanned(admin: Admin, identity: { email?: string | null; phone?: string | null }): Promise<boolean> {
  const email = identity.email?.trim().toLowerCase()
  if (email) {
    const { data } = await admin.from('banned_users').select('id').eq('email', email).limit(1)
    if (data && data.length > 0) return true
  }

  const phone = identity.phone ? normalizePhone(identity.phone) : ''
  if (phone) {
    const { data } = await admin.from('banned_users').select('id').contains('phones_normalized', [phone]).limit(1)
    if (data && data.length > 0) return true
  }

  return false
}
