import Stripe from 'stripe'

// Server-side only — never import in client components.
//
// The client is created lazily on first use rather than at module load, so
// `next build` can import routes that use Stripe (to collect page config)
// without STRIPE_SECRET_KEY being present in the build environment.
let client: Stripe | undefined

function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    client = new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
  }
  return client
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const real = getStripe()
    const value = Reflect.get(real, prop, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
})
