import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Dev-only: removes profiles that have no password_hash (created via old Supabase Auth flow)
// These accounts cannot log in with the new custom auth system.
// DELETE them here, then sign up fresh at /signup.
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: deleted, error } = await admin
    .from('profiles')
    .delete()
    .is('password_hash', null)
    .select('id, email, role')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    deleted: deleted?.length ?? 0,
    accounts: deleted?.map(p => ({ email: p.email, role: p.role })),
  })
}
