import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Fragment } from 'react'
import Footer from '../components/Footer'

export const metadata: Metadata = { title: 'Privacy Policy — Tydio' }

const EFFECTIVE_DATE = 'November 5, 2026'
const CONTACT_EMAIL = 'kennedicoats@tydioapp.com'

const sections = [
  { id: 'information-we-collect', title: 'Information we collect' },
  { id: 'how-we-use', title: 'How we use your information' },
  { id: 'how-we-share', title: 'How we share your information' },
  { id: 'service-providers', title: 'Third-party service providers' },
  { id: 'cookies', title: 'Cookies, analytics, and similar technologies' },
  { id: 'communications', title: 'Text messages, email, and push notifications' },
  { id: 'retention', title: 'How long we keep your information' },
  { id: 'security', title: 'How we protect your information' },
  { id: 'choices', title: 'Your choices and rights' },
  { id: 'children', title: 'Children' },
  { id: 'changes', title: 'Changes to this policy' },
  { id: 'contact', title: 'Contact us' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  )
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

const providers: { name: string; purpose: string; data: string; href: string }[] = [
  {
    name: 'Supabase',
    purpose: 'Database and file storage that hosts the Tydio platform',
    data: 'All account, booking, message, review, and uploaded file data described in this policy',
    href: 'https://supabase.com/privacy',
  },
  {
    name: 'Stripe',
    purpose: 'Payment processing for customers, background check fees paid by Tidy Pros, and payouts to Tidy Pros (Stripe Connect)',
    data: 'Name, email, card details, billing information, transaction amounts; for Tidy Pros, identity details (including date of birth) and bank account details collected by Stripe during payout setup',
    href: 'https://stripe.com/privacy',
  },
  {
    name: 'GoodHire / Checkr',
    purpose: 'Identity verification and background screening for Tidy Pros',
    data: 'Information a Tidy Pro submits directly to Checkr (such as legal name, date of birth, Social Security number, a photo of a government-issued ID, and a selfie that Checkr may compare to the ID photo) and the resulting verification and report status',
    href: 'https://checkr.com/privacy-policy',
  },
  {
    name: 'Twilio',
    purpose: 'Sending text (SMS) messages, and connecting phone calls between customers and Tidy Pros without sharing their numbers',
    data: 'Phone number, message content, and call details (when a call was made, how long it lasted, and the numbers it connected). Calls are not recorded',
    href: 'https://www.twilio.com/legal/privacy',
  },
  {
    name: 'Brevo',
    purpose: 'Sending account and booking emails, and marketing emails to people who opt in',
    data: 'Name, email address, account type (customer or Tidy Pro), email content, and whether you are subscribed to marketing emails. Brevo may also record whether an email was delivered and opened, and whether links in it were clicked',
    href: 'https://www.brevo.com/legal/privacypolicy/',
  },
  {
    name: 'OpenAI',
    purpose: 'Validating cleaning tasks and estimating how long they will take',
    data: 'The task details you enter (task name, room, mess level, additional issues, and task notes). We do not intentionally include your account name, contact details, saved service address, or designated entry instructions in this task-validation request. However, any personal or sensitive information you type into task names, descriptions, or notes can be included in the text sent to OpenAI',
    href: 'https://openai.com/policies/privacy-policy',
  },
  {
    name: 'Google Maps Platform',
    purpose: 'Address autocomplete when you type an address, and converting saved addresses into map coordinates so we can measure distances',
    data: 'The address text you type or save, plus standard device and browser information sent to Google',
    href: 'https://policies.google.com/privacy',
  },
  {
    name: 'PostHog',
    purpose: 'Product analytics and session recordings, so we can understand how the site is used, find bugs, and improve it',
    data: 'Pages visited, time on page, buttons and links clicked, recordings of how you move through and interact with pages, device and browser type, approximate location derived from IP address, and a random identifier that is not linked to your account',
    href: 'https://posthog.com/privacy',
  },
  {
    name: 'Vercel',
    purpose: 'Hosting and serving the Tydio website',
    data: 'Standard request information such as IP address, browser and device type, and the pages requested, kept in server logs',
    href: 'https://vercel.com/legal/privacy-policy',
  },
  {
    name: 'Chatbase',
    purpose: 'The AI-powered support chat widget on our site',
    data: 'Anything you type into the chat widget, plus standard device and browser information. Replies are generated by AI, and we can review chat conversations to improve our support',
    href: 'https://www.chatbase.co/legal/privacy',
  },
  {
    name: 'Tally',
    purpose: 'Hosting the waitlist sign-up form on our homepage',
    data: 'Whatever you enter in the form, plus standard device and browser information',
    href: 'https://tally.so/help/privacy-policy',
  },
  {
    name: 'Browser push services',
    purpose: 'Delivering push notifications you have opted in to (operated by your browser vendor, such as Google, Apple, or Mozilla)',
    data: 'A push subscription endpoint and the notification content',
    href: '',
  },
]

// Shown directly after the OpenAI provider card.
function AiNotice() {
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm space-y-2">
      <p className="font-semibold text-slate-900">AI task notes and support chat</p>
      <p>
        <strong>
          Do not put names, phone numbers, email addresses, home addresses, gate or door codes, key locations, passwords,
          payment details, government identifiers, health information, or other sensitive information in task names, mess
          descriptions, task notes, or AI support chat.
        </strong>{' '}
        Use the designated booking address and entry-instruction fields for information needed by your Tidy Pro. Information
        entered into free-text fields may be processed by the AI service even if it was included accidentally. This warning
        does not remove Tydio&rsquo;s privacy or security responsibilities.
      </p>
      <p>
        OpenAI states that API inputs and outputs are not used to train its models by default unless the API customer
        explicitly opts in. This is not a promise of zero retention: provider security logging and feature-specific storage
        may apply. This document does not establish that Tydio&rsquo;s account settings, API endpoints, or Chatbase&rsquo;s
        underlying AI settings have been independently verified. Contact us before submitting sensitive information or to
        ask about AI processing alternatives; we do not currently promise an in-app AI opt-out or that every feature is
        available without AI processing. Other AI services, including support chat, may have different retention and
        training terms. Tydio remains responsible for disclosures and safeguards required by applicable law; no blanket
        waiver of responsibility for third-party AI processing is created by this policy.
      </p>
    </div>
  )
}

export default function PrivacyPolicyPage() {
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
        <article className="max-w-3xl mx-auto px-6 py-12 text-slate-600 leading-relaxed space-y-10">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Privacy Policy</h1>
            <p className="text-sm text-slate-400">Effective {EFFECTIVE_DATE}</p>
            <p>
              Tydio LLC (&ldquo;Tydio,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) runs a marketplace that connects people who need
              specific cleaning tasks done (&ldquo;customers&rdquo;) with independent cleaning professionals (&ldquo;Tidy
              Pros&rdquo;). This Privacy Policy explains what information we collect when you use our website and services,
              how we use it, who we share it with, and the choices you have.
            </p>
            <p>
              By creating an account or using Tydio, you agree to this policy. If you do not agree, please do not use the
              service.
            </p>
          </div>

          <nav className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
            <p className="font-semibold text-slate-900 mb-3">Contents</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              {sections.map(s => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-sky-600 hover:underline underline-offset-2">{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          <Section id="information-we-collect" title="1. Information we collect">
            <Sub title="Information you give us: all users">
              <List items={[
                <><strong>Account details:</strong> first and last name, email address, phone number, password (stored only in hashed form), and whether you signed up as a customer or a Tidy Pro.</>,
                <><strong>Profile details:</strong> time zone and notification preferences.</>,
                <><strong>Waitlist sign-ups:</strong> anything you enter in the waitlist form on our homepage, which is hosted by Tally.</>,
                <><strong>Consent records:</strong> when you accepted our Terms and this Privacy Policy, and whether you opted in to text messages and push notifications.</>,
                <><strong>Messages:</strong> messages you send through Tydio to a customer or Tidy Pro about a booking.</>,
                <><strong>Call records:</strong> when you call a customer or Tidy Pro through Tydio, which booking it was for, who started it, when, how it ended, and how long it lasted. We do not record calls.</>,
                <><strong>Reviews and ratings:</strong> ratings and written feedback you leave after a booking.</>,
                <><strong>Support conversations:</strong> anything you send us by email or type into the chat widget on our site.</>,
              ]} />
            </Sub>

            <Sub title="Information you give us: customers">
              <List items={[
                <><strong>Service addresses:</strong> the street address, city, state, and ZIP code of homes where you book cleanings.</>,
                <><strong>Booking details:</strong> the cleaning tasks you request (task name, room, mess level, notes, and any unusual conditions), preferred dates and times, pets in the home, whether you provide supplies, notes for your Tidy Pro, and <strong>entry instructions</strong> (such as gate codes or where a key is kept).</>,
                <><strong>Payment information:</strong> card details are entered directly into Stripe&apos;s secure form and are never stored on our servers. We keep only the card brand, expiration month and year, and Stripe reference IDs.</>,
                <><strong>Promo codes</strong> you enter.</>,
              ]} />
            </Sub>

            <Sub title="Information you give us: Tidy Pros">
              <List items={[
                <><strong>Home address:</strong> used to measure how far you are from each job and to match you with nearby customers. Customers see only your city and state, never your street address.</>,
                <><strong>Professional profile:</strong> bio, profile photo, service areas, ZIP codes you serve, travel radius, availability, and any allergies or sensitivities you choose to list. Your profile, including allergies, is shown to customers.</>,
                <><strong>Background check fee:</strong> if you pay a screening fee, which covers both identity verification and the background check, you pay it through Stripe&apos;s secure checkout. We keep the amount, payment and refund status, and Stripe reference IDs.</>,
                <><strong>Insurance information:</strong> insurer name, policy expiration date, and the insurance documents you upload.</>,
                <><strong>Identity verification:</strong> you verify your identity directly with Checkr, our identity verification and screening provider, for example by submitting a photo of a government-issued ID and a selfie. Checkr may use facial comparison technology to confirm the selfie matches the ID. We receive and store only the result (for example, verified or not verified) and related dates, not your ID images, selfie, or any facial data.</>,
                <><strong>Background check:</strong> you submit your screening information directly to our screening provider (GoodHire, powered by Checkr). We receive and store only the status of your check (for example, pending, passed, or failed) and related dates, not the full report contents.</>,
                <><strong>Payout information:</strong> when you set up payouts, Stripe collects your bank account details and the identity details it needs to verify you, including your date of birth, directly on its own secure pages. We ask Stripe to collect these all at setup, rather than later when your payouts reach a certain amount, so your payouts aren&apos;t paused for missing details. We don&apos;t see or store your date of birth or bank details; we store only your Stripe account ID and whether onboarding is complete.</>,
                <><strong>Job records:</strong> photos you upload of completed tasks, completion status, earnings, tips, and acceptance and cancellation history.</>,
                <><strong>Signature records:</strong> when you sign the Independent Contractor and Platform Agreement, the legal name, any business entity and authorized representative, and the address you enter, plus your account email, IP address, browser, and the time you signed, along with the signed copy of the agreement.</>,
              ]} />
            </Sub>

            <Sub title="Information collected automatically">
              <List items={[
                <><strong>Usage and device information:</strong> pages you visit, time spent, buttons and links clicked, browser and device type, operating system, referring page, and IP address (from which an approximate location can be inferred). We don&apos;t connect this analytics data to your name or account.</>,
                <><strong>Session recordings:</strong> we record how visitors use our pages, such as scrolling, clicks, and the pages they move between, so we can find and fix problems. Recordings hide what you type into form fields, such as passwords, card details, addresses, and messages, and aren&apos;t linked to your name or account.</>,
                <><strong>Precise location, only if you allow it:</strong> if you choose &ldquo;use my current location&rdquo; when scheduling, your browser shares your device&apos;s coordinates with us so we can find nearby Tidy Pros. You can decline this in your browser at any time.</>,
                <><strong>Push subscription data:</strong> if you enable push notifications, your browser gives us a subscription endpoint and key that let us send notifications to that device.</>,
                <><strong>Security and fraud records:</strong> payment disputes, chargebacks, refunds, and account activity that we record when we investigate complaints or suspicious behavior.</>,
              ]} />
            </Sub>

            <Sub title="Information from others">
              <List items={[
                <><strong>Other users:</strong> customers rate Tidy Pros and Tidy Pros rate customers after each booking (for example, communication, accuracy of access instructions, and whether they would work together again).</>,
                <><strong>Reports:</strong> if a customer reports a problem with a Tidy Pro, we keep the report and use it to review that Tidy Pro.</>,
                <><strong>Service providers:</strong> payment status, disputes, and refunds from Stripe, and identity verification and background check status from Checkr.</>,
              ]} />
            </Sub>
          </Section>

          <Section id="how-we-use" title="2. How we use your information">
            <List items={[
              'Create and manage your account, verify your email address, and keep you signed in.',
              'Decide when service is available in your area and manage the waitlist.',
              'Validate requested tasks, estimate how long they will take, and calculate pricing.',
              'Match customers with available Tidy Pros nearby, based on location, availability, and service area.',
              'Schedule, confirm, remind, and complete bookings, and let customers and Tidy Pros message each other.',
              'Process payments, card authorizations, tips, refunds, and Tidy Pro payouts.',
              'Screen and approve Tidy Pros, including identity verification, background checks, and insurance verification, and remind Tidy Pros before insurance expires.',
              'Display ratings and reviews and keep the marketplace trustworthy.',
              'Send booking updates, account notices, and security messages by email, text, or push notification, as you have allowed.',
              'If you opt in, send you marketing emails about Tydio news, tips, and offers.',
              'Provide customer support.',
              'Detect, investigate, and prevent fraud, abuse, safety incidents, and violations of our Terms, including preventing banned users from creating new accounts.',
              'Analyze how the site is used so we can fix problems and improve the service.',
              'Comply with legal, tax, and accounting obligations and enforce our agreements.',
            ]} />
            <p>We do not sell your personal information, and we do not use it for targeted advertising.</p>
          </Section>

          <Section id="how-we-share" title="3. How we share your information">
            <Sub title="Between customers and Tidy Pros">
              <p>Tydio only works if the people on each side of a booking can see some information about each other:</p>
              <List items={[
                <><strong>What customers see about Tidy Pros:</strong> full name, profile photo, bio, city and state, any allergies or sensitivities the Tidy Pro lists, rating, review count, approximate distance, availability, and verification and insurance badges.</>,
                <><strong>What Tidy Pros see about customers:</strong> when a booking request is sent to or accepted by a Tidy Pro, they see the customer&apos;s full name, how long they&apos;ve been a member, the service address, the requested tasks and notes, pets, entry instructions, and ratings other Tidy Pros have given the customer. Please share only what your Tidy Pro needs to do the job.</>,
                <><strong>Messages</strong> you send about a booking are visible to the other party on that booking.</>,
              ]} />
            </Sub>
            <Sub title="With service providers">
              <p>
                We share information with companies that perform services for us, only as needed for those services. They are
                listed in the next section.
              </p>
            </Sub>
            <Sub title="For legal reasons and safety">
              <p>
                We may disclose information if we believe in good faith that it is required by law, subpoena, or court order;
                to protect the rights, property, or safety of Tydio, our users, or the public; or to investigate fraud or
                violations of our Terms.
              </p>
            </Sub>
            <Sub title="Business transfers">
              <p>
                If Tydio is involved in a merger, acquisition, financing, or sale of assets, your information may be transferred
                as part of that transaction. We will notify you before your information becomes subject to a different privacy
                policy.
              </p>
            </Sub>
            <Sub title="With your consent">
              <p>We may share information for other purposes when you ask us to or agree to it.</p>
            </Sub>
          </Section>

          <Section id="service-providers" title="4. Third-party service providers">
            <p>
              We use the following companies to run Tydio. Each receives only the information it needs for its purpose and
              handles it under its own privacy policy.
            </p>
            <div className="space-y-3">
              {providers.map(p => (
                <Fragment key={p.name}>
                  <div className="rounded-xl border border-slate-100 p-4 text-sm">
                    <p className="font-semibold text-slate-900">
                      {p.href ? (
                        <a href={p.href} target="_blank" rel="noopener noreferrer" className="hover:text-sky-600">{p.name}</a>
                      ) : p.name}
                    </p>
                    <p className="mt-1"><span className="text-slate-400">Purpose:</span> {p.purpose}</p>
                    <p className="mt-0.5"><span className="text-slate-400">Information:</span> {p.data}</p>
                  </div>
                  {p.name === 'OpenAI' && <AiNotice />}
                </Fragment>
              ))}
            </div>
            <p>
              Your information is stored and processed in the United States.
            </p>
          </Section>

          <Section id="cookies" title="5. Cookies, analytics, and similar technologies">
            <List items={[
              <><strong>Essential cookies:</strong> we set a secure, HTTP-only session cookie that keeps you signed in. The site will not work properly without it.</>,
              <><strong>Local storage:</strong> we store small preferences on your device, such as whether you dismissed a tip, so we don&apos;t show it again.</>,
              <><strong>Analytics:</strong> PostHog uses cookies or local storage to measure page views and page exits, record sessions, and tell visits apart.</>,
              <><strong>Third-party scripts:</strong> the Chatbase chat widget and Google Maps address search load scripts from those companies, which may set their own cookies or collect device information.</>,
            ]} />
            <p>
              You can block or delete cookies in your browser settings. Blocking essential cookies will stop you from signing in.
              We do not currently respond to &ldquo;Do Not Track&rdquo; signals, because there is no common standard for them.
            </p>
          </Section>

          <Section id="communications" title="6. Text messages, email, and push notifications">
            <Sub title="Email">
              <p>
                We send emails needed to run your account, such as email verification, password resets, booking confirmations,
                and receipts. You can turn off non-essential email notifications in your profile settings. Account and security
                emails will still be sent.
              </p>
              <p>
                <strong>Marketing emails.</strong> If you tick the optional box when you sign up, we add your name, email
                address, and account type to our marketing list with Brevo and send you occasional emails about Tydio news,
                tips, and offers. You can unsubscribe at any time using the link at the bottom of any marketing email; this
                does not affect account or booking emails. If you delete your account, we remove you from the marketing list.
              </p>
            </Sub>
            <Sub title="Text messages (SMS)">
              <p>
                If you opt in, we text you about booking requests, booking updates, reminders, and messages. How often you hear
                from us depends on your activity. Message and data rates may apply. Agreeing to texts is not required to use
                Tydio.
              </p>
              <p>
                You can opt out at any time by replying <strong>STOP</strong> to any text from us, or by turning off text
                notifications in your profile settings. Replying STOP turns off text notifications for every Tydio account that
                uses your number, and your settings update to match. You&apos;ll get one message confirming you&apos;ve been
                unsubscribed. To start receiving texts again, reply <strong>START</strong>. If you turned texts off in your settings
                and never replied STOP, you can also turn them back on in your settings.
              </p>
              <p>
                Reply <strong>HELP</strong> for help, or email us at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>.
                We don&apos;t read other replies to our texts, so please use in-app messaging or email for anything else.
              </p>
              <p>
                <strong>We do not share your mobile phone number or SMS opt-in consent with third parties or affiliates for
                their marketing or promotional purposes.</strong> We share your number only with Twilio, the provider that
                sends our texts and connects calls.
              </p>
            </Sub>
            <Sub title="Phone calls">
              <p>
                Customers and Tidy Pros can call each other about a booking from its messages, from when the booking is
                accepted until 2 hours after it ends. When you tap Call, we ring your phone from Tydio&apos;s number, and once
                you answer and press 1, we connect you. Both of you see only Tydio&apos;s number, never each other&apos;s.
                Twilio connects the call. We keep a record of the call as described above, but we do not record or listen to
                calls.
              </p>
            </Sub>
            <Sub title="Push notifications">
              <p>
                If you allow push notifications, we send booking updates to your browser or device. You can turn them off in
                your browser or device settings, or decline them when we ask.
              </p>
            </Sub>
          </Section>

          <Section id="retention" title="7. How long we keep your information">
            <p>
              We keep your personal information for as long as your account is open. You can delete your account at any time
              from the <strong>Profile</strong> tab in the app.
            </p>
            <Sub title="Before you can delete">
              <p>
                You can&apos;t delete your account while a booking is pending or scheduled, while a no-show or no-access
                report on one of your bookings is still being reviewed, or while a completed booking is still waiting for its
                Tidy Pro to be paid. This keeps a customer from being left without a cleaner, and a Tidy
                Pro from going unpaid. Cancel or finish those bookings first, or email us if you need help.
              </p>
            </Sub>
            <Sub title="What is deleted right away">
              <List items={[
                'Your account and profile, including your name, email, phone, password, photo, and notification and consent settings.',
                'Your saved addresses, booking drafts, saved card records, and push notification subscriptions. We also delete your customer record at Stripe, which removes your saved cards there.',
                'For customers: your booking history, including the tasks, notes, entry instructions, messages, call records, task photos, payment records, and reviews tied to those bookings.',
                'For Tidy Pros: your professional profile, availability, service areas, uploaded profile photo and insurance documents, and your identity verification and background check status records.',
              ]} />
            </Sub>
            <Sub title="What may remain">
              <List items={[
                <>For Tidy Pros: bookings you completed belong to the customer&apos;s history. They stay there, no longer linked to your account, along with your name as it appeared on the booking, the task photos you uploaded, and any review you left. They are deleted when the customer deletes their account.</>,
                'Ratings and reviews a customer left about you no longer link to your account, but stay in that customer’s history until they delete it.',
                'Records of fraud, safety incidents, chargebacks, or other risk events may be kept, no longer linked to your account, so we can protect the platform.',
                'If an account is removed for violating our Terms, we keep that account’s email address, phone number, and name to prevent it from signing up again.',
                'If our team deletes your account, we keep a record of its name, email address, account type, and the date it was deleted.',
                'For Tidy Pros: your signed Independent Contractor and Platform Agreement and its signature record are kept after you delete your account, no longer linked to it, for legal, tax, and dispute purposes.',
                'Our service providers keep some information under their own policies and legal obligations. For example, Stripe keeps transaction records, and Checkr keeps its identity verification records and background screening reports. A Tidy Pro’s Stripe payout account belongs to the Tidy Pro and is not closed when they delete their Tydio account; it can be managed or closed through Stripe.',
                'Copies of deleted information may stay in our database backups for a limited time until those backups are overwritten.',
              ]} />
            </Sub>
          </Section>

          <Section id="security" title="8. How we protect your information">
            <p>
              We take reasonable steps to protect your information. All traffic is encrypted with HTTPS, passwords are stored
              only as one-way hashes, card numbers are handled by Stripe and never touch our servers, and access to our
              database and admin tools is restricted. Insurance documents are stored privately and can only be opened by
              our team.
            </p>
            <p>
              Profile photos and task photos currently use publicly accessible, unauthenticated URLs. Anyone who obtains or
              receives an exact link can view and reshare the image without signing in. An obscure link is not an access
              control, and Tydio cannot guarantee that recipients will not copy an image or that removal will delete copies
              held by others. <strong>Do not upload images showing people without permission, children, identity documents,
              mail, addresses, access codes, valuables, or other private details.</strong> Frame task photos tightly around the
              cleaning area and remove identifying details before upload. Contact{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a> to
              report exposure or request removal; requests are subject to applicable legal rights and retention exceptions.
              This policy does not represent that signed, expiring URLs or authenticated access for these photos are already
              implemented.
            </p>
            <p>
              No system is completely secure, however, and we cannot guarantee the security of your information. If we learn
              of a security breach that affects your personal information, we will notify you as required by law.
            </p>
          </Section>

          <Section id="choices" title="9. Your choices and rights">
            <List items={[
              <><strong>Access and update:</strong> you can view and edit most of your information, including your name, phone, addresses, photo, and notification settings, in your profile.</>,
              <><strong>Delete your account:</strong> you can delete your account at any time from the Profile tab (see <a href="#retention" className="text-sky-600 underline underline-offset-2">How long we keep your information</a> for what is deleted). You can also email us to ask for deletion.</>,
              <><strong>Communications:</strong> you can turn off text, email, and push notifications, and unsubscribe from marketing emails, as described above.</>,
              <><strong>Location:</strong> you can deny or revoke location access in your browser at any time.</>,
            ]} />
            <p>
              Depending on where you live, you may also have the right to request a copy of your personal information, ask us
              to correct or delete it, or appeal a decision we make about your request. To make a request, email us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>.
              We may need to verify your identity before responding. We will not treat you differently for exercising your
              privacy rights.
            </p>

            <Sub title="State privacy notices">
              <p>
                These additional disclosures apply to the extent a state privacy law covers Tydio and grants rights to you.
                Residence alone does not establish that every comprehensive state law applies to this business. Nothing here
                waives rights under other applicable privacy, security, consumer-protection, or breach-notification laws.
              </p>
            </Sub>

            <Sub title="California notice: categories and purposes">
              <p>
                The categories below summarize the information described in Sections 1 through 4, including information
                collected and disclosed during the preceding 12 months to the extent Tydio operated during that period. They
                are not a statement that every category is collected from every user.
              </p>
              <List items={[
                <><strong>Identifiers and customer-record information:</strong> names, account identifiers, contact details, service and provider addresses, consent records, and limited payment reference information. Used for accounts, matching, communications, payments, security, and support. Disclosed as needed to hosting/database, communications, mapping, payment, waitlist, and support providers and to booking counterparties as described in Section 3.</>,
                <><strong>Commercial information:</strong> bookings, tasks, purchases, payment and payout status, tips, cancellations, and disputes. Used to operate bookings, payments, support, fraud prevention, and required records. Disclosed as needed to hosting/database, payment, communications, AI task-validation and support providers, and booking counterparties; task-validation sharing is limited as described in Section 4.</>,
                <><strong>Internet or network activity:</strong> device/browser information, IP addresses, page interactions, session recordings, and notification identifiers. Used for hosting, security, analytics, notifications, and troubleshooting. Disclosed as needed to hosting, analytics, embedded mapping/chat/form providers, and browser push services.</>,
                <><strong>Geolocation:</strong> addresses, approximate IP-derived location, and precise device coordinates if permission is granted. Used for matching, distances, address search, and analytics as described above. Disclosed as needed to hosting/database, mapping and analytics providers and booking counterparties, subject to the distinctions in Sections 1 and 3.</>,
                <><strong>Visual and communication information:</strong> profile and task photos, booking messages, reviews, and support conversations. Used for profiles, service documentation, communications, support, and safety. Disclosed as needed to hosting/database and communications/support providers and relevant users. Photo links have the public-access limitation described in Section 8. Free-text task details may be sent to OpenAI as described in Section 4.</>,
                <><strong>Professional information and limited screening records:</strong> provider bios, availability, service areas, insurance documents, identity verification and screening status, and related dates. Used for provider onboarding, matching, verification, and safety. Disclosed as needed to hosting/database and screening providers and, for the profile fields and badges identified in Section 3, customers. Screening and payout providers separately collect the identifiers described in Section 1 directly from providers.</>,
                <><strong>Sensitive personal information:</strong> account access credentials, precise geolocation when permitted, private booking communications where applicable, health-related allergies or sensitivities voluntarily listed by Tidy Pros, and, for Tidy Pros, the government ID images, Social Security number, and selfie submitted directly to Checkr for identity verification and screening, which Checkr may process using facial comparison. Tydio receives only the verification and screening results, not the ID images, selfie, or facial data. Used for account security, requested services, safety, and displaying the profile information expressly described in Sections 1 and 3. Providers receiving these data depend on the function, as described above. Do not add sensitive information to AI-bound text or photo uploads. Any legally required consent or limitation right remains applicable.</>,
              ]} />
              <p>
                We obtain these categories from you, your device/browser, other booking participants, and service providers.
                Sections 2 and 3 describe business purposes and recipients, including legally required disclosures and business
                transfers. Retention is based on the criteria and deletion exceptions in Section 7, including account/service
                needs, legal obligations, disputes, security, and backup cycles; this notice does not establish new fixed
                retention periods.
              </p>
            </Sub>

            <Sub title="California rights and requests">
              <p>
                Where the CCPA applies, you may request access to specific personal information and information about
                categories, sources, purposes, and recipients; deletion subject to exceptions; correction; and portability where
                required. You may also opt out of sale or sharing for cross-context behavioral advertising and limit uses of
                sensitive personal information where the law grants that right. You may use an authorized agent subject to
                legally permitted verification, and you will not be unlawfully discriminated against for exercising rights. We
                do not offer financial incentives for personal information.
              </p>
              <p>
                Email{' '}
                <a href={`mailto:${CONTACT_EMAIL}?subject=Privacy%20request`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>{' '}
                with &ldquo;Privacy request&rdquo; and describe your request. You do not need to create an account. We may
                verify identity proportionately using information already available and may request evidence of an
                agent&rsquo;s authority, but do not email passwords or full identity documents. Where CCPA deadlines apply, we
                will confirm receipt of access, correction, and deletion requests within 10 business days and respond within 45
                calendar days, with an additional 45 days when legally permitted after timely notice explaining the extension.
                Applicable sale/sharing opt-outs and sensitive-information limitation requests will be processed as soon as
                feasibly possible and within 15 business days.
              </p>
            </Sub>

            <Sub title="Sale, sharing, and preference signals">
              <p>
                Tydio does not sell personal information or share it for cross-context behavioral advertising, and does not
                knowingly sell or share information about individuals under 16. Service-provider disclosures and user-directed
                disclosures described here are not intended as advertising sales or sharing. We do not use sensitive personal
                information to infer characteristics or for purposes beyond providing requested services and other legally
                permitted purposes. On that basis, we do not currently offer a sale/sharing opt-out link or a separate
                sensitive-information limitation link. These statements depend on actual provider contracts, configuration, and
                practices. If practices change, we will supply required notices, choices, and links before beginning covered
                processing. Where legally applicable, Global Privacy Control or another recognized opt-out preference signal will
                be treated as an opt-out of covered sale, sharing, or targeted advertising; we do not represent that such
                processing currently occurs. A browser&rsquo;s Do Not Track setting is distinct from these legally recognized
                signals.
              </p>
            </Sub>

            <Sub title="Other U.S. state rights">
              <p>
                Where another applicable comprehensive state privacy law covers Tydio, residents may have access, correction,
                deletion, portability, consent-withdrawal, and opt-out rights concerning sale, targeted advertising, or
                profiling for decisions with legal or similarly significant effects, subject to that law&rsquo;s exceptions.
                Tydio does not use personal information for targeted advertising or sell it. AI task estimates are used for
                cleaning-task validation, duration, and pricing; this policy does not waive any rights applicable to automated
                decisions. Submit a request using the email above. We will respond within the period required by your
                state&rsquo;s law, generally 45 days, and provide any legally permitted extension notice. If a request is
                denied, the response will explain the reason and any available appeal process. Send an appeal to the same
                address with &ldquo;Privacy appeal&rdquo;; we will respond within the applicable statutory deadline and provide
                information on contacting the relevant state regulator where required.
              </p>
            </Sub>
          </Section>

          <Section id="children" title="10. Children">
            <p>
              Tydio is intended only for people who are at least 18 years old. We do not knowingly collect personal information
              from anyone under 18. If you believe a minor has given us personal information, please contact us and we will
              delete it.
            </p>
          </Section>

          <Section id="changes" title="11. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will change the effective date at the top of
              this page. If the changes are significant, we will let you know by email or a notice in the app before they take
              effect. If you keep using Tydio after the changes take effect, you accept the updated policy.
            </p>
          </Section>

          <Section id="contact" title="12. Contact us">
            <p>
              If you have questions about this Privacy Policy or how we handle your information, contact us:
            </p>
            <address className="not-italic rounded-2xl border border-slate-100 bg-slate-50 p-6 space-y-1">
              <p className="font-semibold text-slate-900">Tydio LLC</p>
              <p>3133 Maple Dr, Ste 240</p>
              <p>Atlanta, GA 30305</p>
              <p>
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>
              </p>
            </address>
          </Section>
        </article>
      </main>

      <Footer />
    </>
  )
}
