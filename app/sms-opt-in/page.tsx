import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import Footer from '../components/Footer'

export const metadata: Metadata = { title: 'Text Message Opt-In — Tydio' }

const CONTACT_EMAIL = 'kennedicoats@tydioapp.com'

// Public proof of our SMS opt-in flow for carrier/Twilio toll-free verification.
// The consent prompt itself is behind login, so this page shows reviewers what users see.
export default function SmsOptInPage() {
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
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">How you opt in to Tydio texts</h1>
          <p>
            Tydio sends text messages only to customers and Tidy Pros who choose to receive them. After you create an
            account and log in, Tydio asks whether you&apos;d like updates by text. You can tap <strong>Yes, text me</strong>{' '}
            to opt in or <strong>No thanks</strong> to decline. Texts are optional and are not required to use Tydio.
          </p>
          <figure className="space-y-2">
            <Image
              src="/sms-opt-in.png"
              alt='The "Stay updated by text?" prompt with No thanks and Yes, text me buttons'
              width={241}
              height={137}
              className="rounded-xl border border-slate-200"
            />
            <figcaption className="text-sm text-slate-500">The opt-in prompt shown in the Tydio app after login.</figcaption>
          </figure>
          <h2 className="text-xl font-semibold text-slate-900">What we text about</h2>
          <p>
            Booking requests, confirmations and changes, appointment reminders, service status updates, new message
            alerts, review requests and account alerts. We do not send marketing or promotional text messages. Message
            frequency varies. Msg &amp; data rates may apply.
          </p>
          <h2 className="text-xl font-semibold text-slate-900">Opting out and help</h2>
          <p>
            Reply <strong>STOP</strong> to any Tydio text to opt out, or turn off text notifications in your profile
            settings. Reply <strong>HELP</strong> for help, or email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>.
          </p>
          <p>
            We do not share your mobile number or opt-in consent with third parties for their marketing purposes. See our{' '}
            <Link href="/terms#sms" className="text-sky-600 underline underline-offset-2">Terms</Link> and{' '}
            <Link href="/privacy" className="text-sky-600 underline underline-offset-2">Privacy Policy</Link>.
          </p>
        </article>
      </main>

      <Footer />
    </>
  )
}
