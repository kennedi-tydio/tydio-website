import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSession, getSession } from '@/lib/auth/session'
import { isBanned } from '@/lib/bannedUsers'

// Clears the session of someone whose account no longer exists, and shows them why
// if they were banned. A route handler because only these can change cookies on a
// plain page visit, and the session has to go before /login will load for them.
export async function GET(req: NextRequest) {
  const session = await getSession()
  const banned = session ? await isBanned(createAdminClient(), { email: session.email }) : false
  await deleteSession()
  return NextResponse.redirect(new URL(banned ? '/login?banned=1' : '/login', req.url))
}
