import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import Footer from '../components/Footer'

export const metadata: Metadata = { title: 'Accessibility — Tydio' }

const CONTACT_EMAIL = 'kennedicoats@tydioapp.com'

export default function AccessibilityPage() {
  return (
    <>
      <header className="border-b border-slate-100 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <Link href="/">
            <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={96} height={35} />
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex-1 bg-white">
        <article className="max-w-3xl mx-auto px-6 py-12 text-slate-600 leading-relaxed space-y-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Accessibility at Tydio</h1>
          <p>
            Tydio is committed to making our website and app accessible to people with disabilities. We aim to meet the Web
            Content Accessibility Guidelines (WCAG) 2.2 Level AA and improve accessibility as our platform grows.
          </p>
          <p>
            For darker, easier-to-read text and buttons, turn on <strong>High contrast</strong> at the bottom of any page or
            under <strong>Profile &rsaquo; Accessibility</strong> in the app.
          </p>
          <p>
            If you experience difficulty accessing any part of Tydio, please email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>.
            Include the page or feature involved, a description of the issue, and your preferred way for us to respond. You
            may also include your browser, device, or assistive technology if helpful. Please do not include passwords or
            sensitive personal information.
          </p>
          <p>
            We welcome accessibility feedback and requests for assistance. We will work with you to help you access our
            services and address reported barriers.
          </p>
        </article>
      </main>

      <Footer />
    </>
  )
}
