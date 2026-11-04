import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Lets the dev server be opened at 127.0.0.1 as well as localhost. Browsers
  // keep separate cookies per hostname, so this allows testing two accounts
  // side by side (one per hostname) in the same browser.
  allowedDevOrigins: ['127.0.0.1'],
  // The contractor agreement PDF is read from disk when a Tidy Pro views or signs
  // it (and when an admin resends it), which the build's file tracing can't see.
  outputFileTracingIncludes: {
    '/pro/**': ['./lib/legal/*.pdf'],
    '/admin/**': ['./lib/legal/*.pdf'],
  },
  experimental: {
    serverActions: {
      // Photo uploads go through server actions and allow up to 10MB; the
      // default 1MB limit would reject most photos taken on a phone.
      bodySizeLimit: '11mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // No site may put Tydio in a frame (clickjacking). Stripe's own
          // frames inside our pages are unaffected.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ]
  },
  skipTrailingSlashRedirect: true,
}

export default nextConfig
