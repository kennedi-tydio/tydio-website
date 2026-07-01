import { type NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

function secret() {
  const key = process.env.JWT_SECRET
  if (!key) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(key)
}

async function getSessionFromRequest(req: NextRequest) {
  const token = req.cookies.get('tydio_session')?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as { profileId: string; role: string; email: string }
  } catch {
    return null
  }
}

const PROTECTED_PATHS = ['/dashboard', '/book', '/bookings']
const AUTH_PATHS = ['/login', '/signup']
const PUBLIC_PATHS = ['/claim-task', '/job', '/review']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pass through static assets and public token-gated pages
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const session = await getSessionFromRequest(request)

  const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p))
  const isAuth = AUTH_PATHS.some(p => pathname.startsWith(p))

  // Redirect unauthenticated users away from protected routes
  if (isProtected && !session) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  if (isAuth && session) {
    const dest = session.role === 'TIDYPRO' ? '/' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Clear an invalid/expired session cookie if present but unreadable
  if (isProtected && !session && request.cookies.has('tydio_session')) {
    const res = NextResponse.redirect(new URL('/login', request.url))
    res.cookies.delete('tydio_session')
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
