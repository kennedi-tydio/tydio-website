import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import ChatbaseScript from './components/ChatbaseScript'
import { PHProvider } from './providers'
import SuspendedPostHogPageView from './components/PostHogPageView'
import './globals.css'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Tydio — Cleaning, Tailored to Your To-Do List',
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
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        <PHProvider>
          <SuspendedPostHogPageView />
          {children}
        </PHProvider>
        <ChatbaseScript />
      </body>
    </html>
  )
}
