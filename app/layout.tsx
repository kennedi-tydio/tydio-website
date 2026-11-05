import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import ChatbaseScript from './components/ChatbaseScript'
import NavigationSpinner from './components/NavigationSpinner'
import ServiceWorkerRegistration from './components/ServiceWorkerRegistration'
import { PHProvider } from './providers'
import SuspendedPostHogPageView from './components/PostHogPageView'
import { CONTRAST_INIT_SCRIPT } from './components/contrast'
import './globals.css'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Tydio — Cleaning made simple',
  description:
    'Get a local cleaning pro for exactly what needs doing — no full-service package required. Affordable flat pricing, no contracts, no hidden fees.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tydio',
  },
}

export const viewport: Viewport = {
  themeColor: '#38C7CA',
  width: 'device-width',
  initialScale: 1,
  // Without this, iOS reports the home indicator inset as 0 and
  // .safe-area-inset-bottom (globals.css) adds no room for it.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions add attributes to <html> before React loads. This only
    // silences mismatches on this one tag, not on anything inside it.
    <html lang="en" className={`${geist.variable} h-full`} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Applies the saved high-contrast choice before first paint so the page
            doesn't flash default colors. Kept in sync with HighContrastToggle. */}
        <script dangerouslySetInnerHTML={{ __html: CONTRAST_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <PHProvider>
          <SuspendedPostHogPageView />
          {children}
        </PHProvider>
        <NavigationSpinner />
        <ChatbaseScript />
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
