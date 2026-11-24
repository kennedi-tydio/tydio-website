import { NextResponse } from 'next/server'
import { refreshIdleSession } from '@/lib/auth/session'

// Called by SessionKeepAlive while someone is using the site, so a session
// without "Stay signed in" only ends after 30 minutes away.
export async function POST() {
  await refreshIdleSession()
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
