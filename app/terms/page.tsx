import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import Footer from '../components/Footer'

export const metadata: Metadata = { title: 'Terms and Conditions — Tydio' }

const LAST_UPDATED = 'November 4, 2026'
const CONTACT_EMAIL = 'kennedicoats@tydioapp.com'
const CONTACT_PHONE = '(850) 345-2532'
const CONTACT_PHONE_HREF = 'tel:+18503452532'
const SITE_URL = 'https://www.tydioapp.com'

const sections = [
  { id: 'services', title: 'Our services' },
  { id: 'ip', title: 'Intellectual property rights' },
  { id: 'userreps', title: 'User representations' },
  { id: 'userreg', title: 'User registration' },
  { id: 'purchases', title: 'Purchases and payment' },
  { id: 'subscriptions', title: 'Subscriptions' },
  { id: 'refunds', title: 'Refund policy' },
  { id: 'prohibited', title: 'Prohibited activities' },
  { id: 'ugc', title: 'User generated contributions' },
  { id: 'license', title: 'Contribution license' },
  { id: 'reviews', title: 'Guidelines for reviews' },
  { id: 'mobile', title: 'Mobile application license' },
  { id: 'thirdparty', title: 'Third-party websites and content' },
  { id: 'sitemanage', title: 'Services management' },
  { id: 'privacy', title: 'Privacy policy' },
  { id: 'copyright', title: 'Copyright infringements' },
  { id: 'termination', title: 'Term and termination' },
  { id: 'modifications', title: 'Modifications and interruptions' },
  { id: 'law', title: 'Governing law' },
  { id: 'disputes', title: 'Dispute resolution' },
  { id: 'corrections', title: 'Corrections' },
  { id: 'disclaimer', title: 'Disclaimer' },
  { id: 'liability', title: 'Limitations of liability' },
  { id: 'indemnification', title: 'Indemnification' },
  { id: 'userdata', title: 'User data' },
  { id: 'electronic', title: 'Electronic communications, transactions, and signatures' },
  { id: 'sms', title: 'SMS text messaging' },
  { id: 'california', title: 'California users and residents' },
  { id: 'misc', title: 'Miscellaneous' },
  { id: 'contact', title: 'Contact us' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const number = sections.findIndex(s => s.id === id) + 1
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">{number}. {title}</h2>
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

function SectionLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <a href={`#${id}`} className="text-sky-600 underline underline-offset-2">{children}</a>
}

function EmailLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`} className="text-sky-600 underline underline-offset-2">{CONTACT_EMAIL}</a>
}

function PhoneLink() {
  return <a href={CONTACT_PHONE_HREF} className="text-sky-600 underline underline-offset-2">{CONTACT_PHONE}</a>
}

function PrivacyLink() {
  return <Link href="/privacy" className="text-sky-600 underline underline-offset-2">Privacy Policy</Link>
}

export default function TermsPage() {
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
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Terms and Conditions</h1>
            <p className="text-sm text-slate-400">Last updated {LAST_UPDATED}</p>

            <h2 className="text-xl font-semibold text-slate-900 pt-2">Agreement to our legal terms</h2>
            <p>
              We are Tydio LLC (&ldquo;<strong>Company</strong>,&rdquo; &ldquo;<strong>we</strong>,&rdquo;
              &ldquo;<strong>us</strong>,&rdquo; &ldquo;<strong>our</strong>&rdquo;), a company registered in Georgia, United
              States at 3133 Maple Dr, Ste 240, Atlanta, GA 30305.
            </p>
            <p>
              We operate the website{' '}
              <a href={SITE_URL} className="text-sky-600 underline underline-offset-2">{SITE_URL}</a> (the
              &ldquo;<strong>Site</strong>&rdquo;), the mobile application Tydio (the &ldquo;<strong>App</strong>&rdquo;), as
              well as any other related products and services that refer or link to these legal terms (the &ldquo;<strong>Legal
              Terms</strong>&rdquo;) (collectively, the &ldquo;<strong>Services</strong>&rdquo;).
            </p>
            <p>
              Tydio is a technology platform that connects customers with independent cleaning service providers (&ldquo;Tidy
              Pros&rdquo;) to book cleaning services. Through Tydio&rsquo;s website and application, customers can browse
              available services, view pricing, schedule bookings, communicate with Tidy Pros, and submit payments. Tidy Pros
              can use the platform to manage their availability, accept bookings, and receive payments for completed services.
            </p>
            <p>
              You can contact us by phone at <PhoneLink />, email at <EmailLink />, or by mail to 3133 Maple Dr, Ste 240,
              Atlanta, GA 30305, United States.
            </p>
            <p>
              These Legal Terms constitute a legally binding agreement made between you, whether personally or on behalf of an
              entity (&ldquo;<strong>you</strong>&rdquo;), and Tydio LLC, concerning your access to and use of the Services. You
              agree that by accessing the Services, you have read, understood, and agreed to be bound by all of these Legal
              Terms. IF YOU DO NOT AGREE WITH ALL OF THESE LEGAL TERMS, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE
              SERVICES AND YOU MUST DISCONTINUE USE IMMEDIATELY.
            </p>
            <p>
              <strong>Changes to these Legal Terms.</strong> We may update these Legal Terms from time to time. We will post
              the revised terms on the Site and in the App, update the &ldquo;Last updated&rdquo; date, and state their
              effective date. For material changes, we will provide at least 30 days&rsquo; advance notice by email to the
              address associated with your account or by a prominent notice on the Site or in the App, unless a shorter period
              is required by law or reasonably necessary to address an urgent security or legal issue. Changes apply
              prospectively and do not change the terms governing an existing dispute or a completed booking. Where applicable
              law requires affirmative consent, a change will bind you only after that consent is obtained. Otherwise,
              continued use after the stated effective date constitutes acceptance to the extent permitted by law. If you
              disagree, stop using the Services; existing payment obligations and accrued rights remain subject to the
              applicable prior terms.
            </p>
            <p>
              The Services are intended for users who are at least 18 years old. Persons under the age of 18 are not permitted
              to use or register for the Services.
            </p>
            <p>We recommend that you print a copy of these Legal Terms for your records.</p>
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

          <Section id="services" title="Our services">
            <p>
              The information provided when using the Services is not intended for distribution to or use by any person or
              entity in any jurisdiction or country where such distribution or use would be contrary to law or regulation or
              which would subject us to any registration requirement within such jurisdiction or country. Accordingly, those
              persons who choose to access the Services from other locations do so on their own initiative and are solely
              responsible for compliance with local laws, if and to the extent local laws are applicable.
            </p>
            <Sub title="Marketplace role and independent Tidy Pros">
              <p>
                Tydio provides a technology marketplace and booking, communication, and payment-facilitation tools. Tydio
                does not itself perform cleaning services. Cleaning services are offered and performed by independent
                third-party Tidy Pros. An accepted cleaning booking creates a service arrangement between the customer and
                the accepting Tidy Pro; Tydio remains responsible for its own platform obligations expressly stated in these
                Legal Terms.
              </p>
              <p>
                Tidy Pros operate independently and are not authorized to act as Tydio&rsquo;s employees, agents, partners,
                or joint venturers, or to bind Tydio. Subject to applicable law, the agreed scope of a booking, safety
                requirements, and platform policies, Tidy Pros control their cleaning methods and manner of performance,
                choose their availability and whether to accept bookings, and may provide services through other channels.
                They are responsible for their own business expenses, taxes, required licenses, permits, and insurance.
                Platform pricing, payment processing, screening, customer support, or enforcement of platform standards does
                not by itself create an employment or agency relationship. Actual legal status is determined by applicable
                law and the facts, not solely by these labels. Any separate Tidy Pro agreement governs additional provider
                obligations; these terms do not override nonwaivable worker rights.
              </p>
            </Sub>
            <Sub title="Third-party conduct, service quality, and screening">
              <p>
                To the fullest extent permitted by law, Tydio is not responsible or vicariously liable for the independent
                acts or omissions of customers or Tidy Pros, including their on-site conduct, negligence, theft, missing
                property, property damage, personal injury, misconduct, failure to attend, or the quality, timing, legality,
                or completeness of cleaning services. Claims concerning a Tidy Pro&rsquo;s own conduct or performance should
                be directed to that Tidy Pro, without limiting any rights you may lawfully have against Tydio for its own
                conduct. Tydio does not guarantee a particular cleaning result or that any participant is safe, qualified,
                insured, or free of misconduct.
              </p>
              <p>
                Tydio uses Checkr, Inc. (including its GoodHire service) to verify the identity of Tidy Pros and to conduct
                background screening. Identity verification may require a Tidy Pro to submit a government-issued ID and a
                selfie directly to Checkr, under Checkr&rsquo;s own disclosures, consent, and privacy terms. Any identity
                verification, background screening, profile, rating, or review is limited in scope and accuracy
                and is not a guarantee of identity, safety, future behavior, or service quality. Screening may not identify
                every record or risk. Tydio&rsquo;s screening and approval obligations remain subject to applicable law. No
                provision excludes liability for Tydio&rsquo;s own fraud, willful misconduct, gross negligence, or other
                responsibility that cannot lawfully be excluded, or waives mandatory consumer or worker protections.{' '}
                <SectionLink id="liability">Section 23</SectionLink> applies to claims against Tydio only to the extent
                permitted by law.
              </p>
              <p>
                Customers must provide accurate task and access information, disclose known hazards, and secure valuables,
                pets, and sensitive information. Tidy Pros must perform only the agreed lawful services and promptly report
                unsafe conditions. Report incidents promptly through the App or the contact details in{' '}
                <SectionLink id="contact">Section 30</SectionLink>; contact emergency services for immediate danger. Tydio
                may assist with reports, refunds, and disputes, but that assistance does not make it the provider of the
                cleaning service or create a guarantee of compensation. Nothing here limits an express refund obligation in{' '}
                <SectionLink id="refunds">Section 7</SectionLink> or a nonwaivable legal remedy.
              </p>
            </Sub>
          </Section>

          <Section id="ip" title="Intellectual property rights">
            <Sub title="Our intellectual property">
              <p>
                We are the owner or the licensee of all intellectual property rights in our Services, including all source
                code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics in the
                Services (collectively, the &ldquo;Content&rdquo;), as well as the trademarks, service marks, and logos
                contained therein (the &ldquo;Marks&rdquo;).
              </p>
              <p>
                Our Content and Marks are protected by copyright and trademark laws (and various other intellectual property
                rights and unfair competition laws) and treaties in the United States and around the world.
              </p>
              <p>
                The Content and Marks are provided in or through the Services &ldquo;AS IS&rdquo; for your personal,
                non-commercial use or internal business purpose only.
              </p>
            </Sub>

            <Sub title="Your use of our Services">
              <p>
                Subject to your compliance with these Legal Terms, including the &ldquo;
                <SectionLink id="prohibited">PROHIBITED ACTIVITIES</SectionLink>&rdquo; section below, we grant you a
                non-exclusive, non-transferable, revocable license to:
              </p>
              <List items={[
                'access the Services; and',
                'download or print a copy of any portion of the Content to which you have properly gained access,',
              ]} />
              <p>solely for your personal, non-commercial use or internal business purpose.</p>
              <p>
                Except as set out in this section or elsewhere in our Legal Terms, no part of the Services and no Content or
                Marks may be copied, reproduced, aggregated, republished, uploaded, posted, publicly displayed, encoded,
                translated, transmitted, distributed, sold, licensed, or otherwise exploited for any commercial purpose
                whatsoever, without our express prior written permission.
              </p>
              <p>
                If you wish to make any use of the Services, Content, or Marks other than as set out in this section or
                elsewhere in our Legal Terms, please address your request to: <EmailLink />. If we ever grant you the
                permission to post, reproduce, or publicly display any part of our Services or Content, you must identify us
                as the owners or licensors of the Services, Content, or Marks and ensure that any copyright or proprietary
                notice appears or is visible on posting, reproducing, or displaying our Content.
              </p>
              <p>We reserve all rights not expressly granted to you in and to the Services, Content, and Marks.</p>
              <p>
                Any breach of these Intellectual Property Rights will constitute a material breach of our Legal Terms and your
                right to use our Services will terminate immediately.
              </p>
            </Sub>

            <Sub title="Your submissions and contributions">
              <p>
                Please review this section and the &ldquo;<SectionLink id="prohibited">PROHIBITED ACTIVITIES</SectionLink>
                &rdquo; section carefully prior to using our Services to understand the (a) rights you give us and (b)
                obligations you have when you post or upload any content through the Services.
              </p>
              <p>
                <strong>Submissions:</strong> By directly sending us any question, comment, suggestion, idea, feedback, or
                other information about the Services (&ldquo;Submissions&rdquo;), you agree to assign to us all intellectual
                property rights in such Submission. You agree that we shall own this Submission and be entitled to its
                unrestricted use and dissemination for any lawful purpose, commercial or otherwise, without acknowledgment or
                compensation to you.
              </p>
              <p>
                <strong>Contributions:</strong> The Services may invite you to chat, contribute to, or participate in blogs,
                message boards, online forums, and other functionality during which you may create, submit, post, display,
                transmit, publish, distribute, or broadcast content and materials to us or through the Services, including but
                not limited to text, writings, video, audio, photographs, music, graphics, comments, reviews, rating
                suggestions, personal information, or other material (&ldquo;Contributions&rdquo;). Any Submission that is
                publicly posted shall also be treated as a Contribution.
              </p>
              <p>
                You understand that Contributions may be viewable by other users of the Services and possibly through
                third-party websites.
              </p>
              <p>
                <strong>When you post Contributions, you grant us a license (including use of your name, trademarks, and
                logos):</strong> By posting any Contributions, you grant us an unrestricted, unlimited, irrevocable, perpetual,
                non-exclusive, transferable, royalty-free, fully-paid, worldwide right, and license to: use, copy, reproduce,
                distribute, sell, resell, publish, broadcast, retitle, store, publicly perform, publicly display, reformat,
                translate, excerpt (in whole or in part), and exploit your Contributions (including, without limitation, your
                image, name, and voice) for any purpose, commercial, advertising, or otherwise, to prepare derivative works of,
                or incorporate into other works, your Contributions, and to sublicense the licenses granted in this section.
                Our use and distribution may occur in any media formats and through any media channels.
              </p>
              <p>
                This license includes our use of your name, company name, and franchise name, as applicable, and any of the
                trademarks, service marks, trade names, logos, and personal and commercial images you provide.
              </p>
              <p>
                <strong>You are responsible for what you post or upload:</strong> By sending us Submissions and/or posting
                Contributions through any part of the Services or making Contributions accessible through the Services by
                linking your account through the Services to any of your social networking accounts, you:
              </p>
              <List items={[
                <>
                  confirm that you have read and agree with our &ldquo;<SectionLink id="prohibited">PROHIBITED
                  ACTIVITIES</SectionLink>&rdquo; and will not post, send, publish, upload, or transmit through the Services
                  any Submission nor post any Contribution that is illegal, harassing, hateful, harmful, defamatory, obscene,
                  bullying, abusive, discriminatory, threatening to any person or group, sexually explicit, false, inaccurate,
                  deceitful, or misleading;
                </>,
                'to the extent permissible by applicable law, waive any and all moral rights to any such Submission and/or Contribution;',
                'warrant that any such Submission and/or Contributions are original to you or that you have the necessary rights and licenses to submit such Submissions and/or Contributions and that you have full authority to grant us the above-mentioned rights in relation to your Submissions and/or Contributions; and',
                'warrant and represent that your Submissions and/or Contributions do not constitute confidential information.',
              ]} />
              <p>
                You are solely responsible for your Submissions and/or Contributions and you expressly agree to reimburse us
                for any and all losses that we may suffer because of your breach of (a) this section, (b) any third
                party&rsquo;s intellectual property rights, or (c) applicable law.
              </p>
              <p>
                <strong>We may remove or edit your Content:</strong> Although we have no obligation to monitor any
                Contributions, we shall have the right to remove or edit any Contributions at any time without notice if in our
                reasonable opinion we consider such Contributions harmful or in breach of these Legal Terms. If we remove or
                edit any such Contributions, we may also suspend or disable your account and report you to the authorities.
              </p>
            </Sub>

            <Sub title="Copyright infringement">
              <p>
                We respect the intellectual property rights of others. If you believe that any material available on or
                through the Services infringes upon any copyright you own or control, please immediately refer to the &ldquo;
                <SectionLink id="copyright">COPYRIGHT INFRINGEMENTS</SectionLink>&rdquo; section below.
              </p>
            </Sub>
          </Section>

          <Section id="userreps" title="User representations">
            <p>
              By using the Services, you represent and warrant that: (1) all registration information you submit will be
              true, accurate, current, and complete; (2) you will maintain the accuracy of such information and promptly update
              such registration information as necessary; (3) you have the legal capacity and you agree to comply with these
              Legal Terms; (4) you are not a minor in the jurisdiction in which you reside; (5) you will not access the
              Services through automated or non-human means, whether through a bot, script or otherwise; (6) you will not use
              the Services for any illegal or unauthorized purpose; and (7) your use of the Services will not violate any
              applicable law or regulation.
            </p>
            <p>
              If you provide any information that is untrue, inaccurate, not current, or incomplete, we have the right to
              suspend or terminate your account and refuse any and all current or future use of the Services (or any portion
              thereof).
            </p>
          </Section>

          <Section id="userreg" title="User registration">
            <p>
              You may be required to register to use the Services. You agree to keep your password confidential and will be
              responsible for all use of your account and password. We reserve the right to remove, reclaim, or change a
              username you select if we determine, in our sole discretion, that such username is inappropriate, obscene, or
              otherwise objectionable.
            </p>
          </Section>

          <Section id="purchases" title="Purchases and payment">
            <p>
              Payments are processed securely by our payment processor, Stripe. We accept the following forms of payment:
            </p>
            <List items={['Visa', 'Mastercard', 'American Express', 'Discover']} />
            <p>
              You agree to provide current, complete, and accurate purchase and account information for all purchases made
              via the Services. You further agree to promptly update account and payment information, including email address,
              payment method, and payment card expiration date, so that we can complete your transactions and contact you as
              needed. Sales tax will be added to the price of purchases as deemed required by us. We may change prices at any
              time. All payments shall be in US dollars.
            </p>
            <p>
              You agree to pay all charges at the prices then in effect for your purchases and any applicable shipping fees,
              and you authorize us to charge your chosen payment provider for any such amounts upon placing your order. We
              reserve the right to correct any errors or mistakes in pricing, even if we have already requested or received
              payment.
            </p>
            <p>
              We reserve the right to refuse any order placed through the Services. We may, in our sole discretion, limit or
              cancel quantities purchased per person, per household, or per order. These restrictions may include orders
              placed by or under the same customer account, the same payment method, and/or orders that use the same billing
              or shipping address. We reserve the right to limit or prohibit orders that, in our sole judgment, appear to be
              placed by dealers, resellers, or distributors.
            </p>
          </Section>

          <Section id="subscriptions" title="Subscriptions">
            <p>
              <strong>Coming soon.</strong> Tydio does not currently offer subscription plans, and you will not be charged
              any recurring fee for using the Services. We plan to introduce subscriptions in 2027. Before we do, we will
              update these Legal Terms with the billing, renewal, trial, cancellation, and pricing terms that apply and
              notify you in advance. You will never be enrolled in or charged for a subscription without your consent.
            </p>
          </Section>

          <Section id="refunds" title="Refund policy">
            <Sub title="Bookings">
              <p>
                When you book through Tydio, your payment includes a payment processing fee charged by Stripe. This
                processing fee is shown at checkout and is <strong>nonrefundable</strong>. If your booking is canceled,
                you will be refunded the amount you paid less the Stripe processing fee. This applies when:
              </p>
              <List items={[
                'you cancel a booking while it is still waiting for a Tidy Pro to accept it;',
                'you cancel an accepted booking more than 12 hours before its scheduled start time, and before your Tidy Pro has arrived;',
                'no Tidy Pro accepts your booking request by one hour before the scheduled start time, in which case we cancel it automatically; or',
                'a Tidy Pro declines your booking and you choose not to request a replacement.',
              ]} />
              <p>
                <strong>Late cancellations.</strong> If you cancel an accepted booking less than 12 hours before its
                scheduled start time, you will be refunded 50% of the amount you paid. The rest is kept to compensate your
                Tidy Pro, who reserved that time for you, and Tydio.
              </p>
              <p>
                <strong>If your Tidy Pro cancels.</strong> If your Tidy Pro cancels an accepted booking at least one hour
                before its scheduled start time, we will notify you and you may choose up to three other Tidy Pros at no
                additional charge. Your payment carries over to whichever of them accepts. If none accepts by one hour
                before the start time, or you cancel instead, you will be refunded the amount you paid less the Stripe
                processing fee. If your Tidy Pro cancels less than one hour before the scheduled start time, you will be
                refunded the full amount, including the processing fee.
              </p>
              <p>
                <strong>If your Tidy Pro can&rsquo;t get in.</strong> If your Tidy Pro arrives but is not given access to
                your home, they will wait 15 minutes after the scheduled start time or their arrival, whichever is later,
                and may then report the booking as &ldquo;Customer unavailable&mdash;no access&rdquo;. The booking is then
                canceled. We review each report and may refund the full amount, 50% of it, or nothing, and will email you
                the outcome.
              </p>
              <p>
                <strong>If your Tidy Pro doesn&rsquo;t show up.</strong> If your Tidy Pro has not arrived 30 minutes after
                the scheduled start time, you may report a no-show in the app, and the booking is canceled. We review each
                report, will email you the amount of your refund, and may suspend the Tidy Pro&rsquo;s account.
              </p>
              <p>
                Once your Tidy Pro has arrived, the booking can no longer be canceled. If there is a problem with a booking
                in progress or completed, use the Report Tidy Pro option in the app or contact us at <EmailLink />. We
                review these reports and may issue a full or partial refund at our discretion.
              </p>
              <p>
                If you are charged in error, or your payment goes through but your booking could not be created, we will
                refund the full amount, including the processing fee.
              </p>
            </Sub>
            <Sub title="Tidy Pro background screening fee">
              <p>
                The background screening fee paid by Tidy Pros covers both identity verification and the background check,
                which Tydio arranges through Checkr. It is nonrefundable, except for duplicate charges, Tydio ordering
                errors, and cases where Tydio cancels onboarding for its own business reasons unrelated to screening results
                or the Tidy Pro&rsquo;s conduct.
              </p>
            </Sub>
            <Sub title="How refunds are paid">
              <p>
                Refunds are returned to the original payment method. Depending on your bank or card issuer, a refund may take
                5 to 10 business days to appear on your statement.
              </p>
            </Sub>
          </Section>

          <Section id="prohibited" title="Prohibited activities">
            <p>
              You may not access or use the Services for any purpose other than that for which we make the Services
              available. The Services may not be used in connection with any commercial endeavors except those that are
              specifically endorsed or approved by us.
            </p>
            <p>As a user of the Services, you agree not to:</p>
            <List items={[
              'Systematically retrieve data or other content from the Services to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us.',
              'Trick, defraud, or mislead us and other users, especially in any attempt to learn sensitive account information such as user passwords.',
              'Circumvent, disable, or otherwise interfere with security-related features of the Services, including features that prevent or restrict the use or copying of any Content or enforce limitations on the use of the Services and/or the Content contained therein.',
              'Disparage, tarnish, or otherwise harm, in our opinion, us and/or the Services.',
              'Use any information obtained from the Services in order to harass, abuse, or harm another person.',
              'Make improper use of our support services or submit false reports of abuse or misconduct.',
              'Use the Services in a manner inconsistent with any applicable laws or regulations.',
              'Engage in unauthorized framing of or linking to the Services.',
              'Upload or transmit (or attempt to upload or to transmit) viruses, Trojan horses, or other material, including excessive use of capital letters and spamming (continuous posting of repetitive text), that interferes with any party’s uninterrupted use and enjoyment of the Services or modifies, impairs, disrupts, alters, or interferes with the use, features, functions, operation, or maintenance of the Services.',
              'Engage in any automated use of the system, such as using scripts to send comments or messages, or using any data mining, robots, or similar data gathering and extraction tools.',
              'Delete the copyright or other proprietary rights notice from any Content.',
              'Attempt to impersonate another user or person or use the username of another user.',
              'Upload or transmit (or attempt to upload or to transmit) any material that acts as a passive or active information collection or transmission mechanism, including without limitation, clear graphics interchange formats ("gifs"), 1×1 pixels, web bugs, cookies, or other similar devices (sometimes referred to as "spyware" or "passive collection mechanisms" or "pcms").',
              'Interfere with, disrupt, or create an undue burden on the Services or the networks or services connected to the Services.',
              'Harass, annoy, intimidate, or threaten any of our employees or agents engaged in providing any portion of the Services to you.',
              'Attempt to bypass any measures of the Services designed to prevent or restrict access to the Services, or any portion of the Services.',
              "Copy or adapt the Services' software, including but not limited to Flash, PHP, HTML, JavaScript, or other code.",
              'Except as permitted by applicable law, decipher, decompile, disassemble, or reverse engineer any of the software comprising or in any way making up a part of the Services.',
              'Except as may be the result of standard search engine or Internet browser usage, use, launch, develop, or distribute any automated system, including without limitation, any spider, robot, cheat utility, scraper, or offline reader that accesses the Services, or use or launch any unauthorized script or other software.',
              'Use a buying agent or purchasing agent to make purchases on the Services.',
              'Make any unauthorized use of the Services, including collecting usernames and/or email addresses of users by electronic or other means for the purpose of sending unsolicited email, or creating user accounts by automated means or under false pretenses.',
              'Use the Services as part of any effort to compete with us or otherwise use the Services and/or the Content for any revenue-generating endeavor or commercial enterprise.',
              'Sell or otherwise transfer your profile.',
              'Use the Services to advertise or offer to sell goods and services.',
              'Share accounts, impersonate another person, or allow an unauthorized person to perform services under their profile.',
              'Request or provide services that are illegal or outside the cleaning services permitted by Tydio.',
              'Harass, threaten, discriminate against, or engage in unwanted sexual conduct toward another user.',
              'Submit fraudulent bookings, payments, refund requests, reviews, or claims of completed services.',
              'Arrange payment outside Tydio for services booked through the platform or encourage others to do so to avoid platform fees.',
              'Post unrelated advertisements, spam, or unauthorized promotions.',
              'Collect, disclose, or misuse another user’s personal information, address, access codes, or private communications.',
              'Share photos or recordings of another user or their home without permission, except as permitted for service documentation or reporting an issue.',
              'Steal, intentionally damage property, or access areas of a property without authorization.',
              'Conceal known hazards that could affect a service provider’s safety, including unsecured aggressive animals, exposed needles, or hazardous materials.',
              'Pressure another user to perform services beyond the agreed booking without their agreement and any required booking adjustment.',
              'Manipulate ratings or reviews, including through threats, fake accounts, or compensation conditioned on a positive review.',
              'Interfere with platform security, access another user’s account, or use automated tools to collect platform data without authorization.',
            ]} />
          </Section>

          <Section id="ugc" title="User generated contributions">
            <p>
              The Services may invite you to chat, contribute to, or participate in blogs, message boards, online forums, and
              other functionality, and may provide you with the opportunity to create, submit, post, display, transmit,
              perform, publish, distribute, or broadcast content and materials to us or on the Services, including but not
              limited to text, writings, video, audio, photographs, graphics, comments, suggestions, or personal information or
              other material (collectively, &ldquo;Contributions&rdquo;). Contributions may be viewable by other users of the
              Services and through third-party websites. As such, any Contributions you transmit may be treated as
              non-confidential and non-proprietary. When you create or make available any Contributions, you thereby represent
              and warrant that:
            </p>
            <List items={[
              'The creation, distribution, transmission, public display, or performance, and the accessing, downloading, or copying of your Contributions do not and will not infringe the proprietary rights, including but not limited to the copyright, patent, trademark, trade secret, or moral rights of any third party.',
              'You are the creator and owner of or have the necessary licenses, rights, consents, releases, and permissions to use and to authorize us, the Services, and other users of the Services to use your Contributions in any manner contemplated by the Services and these Legal Terms.',
              'You have the written consent, release, and/or permission of each and every identifiable individual person in your Contributions to use the name or likeness of each and every such identifiable individual person to enable inclusion and use of your Contributions in any manner contemplated by the Services and these Legal Terms.',
              'Your Contributions are not false, inaccurate, or misleading.',
              'Your Contributions are not unsolicited or unauthorized advertising, promotional materials, pyramid schemes, chain letters, spam, mass mailings, or other forms of solicitation.',
              'Your Contributions are not obscene, lewd, lascivious, filthy, violent, harassing, libelous, slanderous, or otherwise objectionable (as determined by us).',
              'Your Contributions do not ridicule, mock, disparage, intimidate, or abuse anyone.',
              'Your Contributions are not used to harass or threaten (in the legal sense of those terms) any other person and to promote violence against a specific person or class of people.',
              'Your Contributions do not violate any applicable law, regulation, or rule.',
              'Your Contributions do not violate the privacy or publicity rights of any third party.',
              'Your Contributions do not violate any applicable law concerning child pornography, or otherwise intended to protect the health or well-being of minors.',
              'Your Contributions do not include any offensive comments that are connected to race, national origin, gender, sexual preference, or physical handicap.',
              'Your Contributions do not otherwise violate, or link to material that violates, any provision of these Legal Terms, or any applicable law or regulation.',
            ]} />
            <p>
              Any use of the Services in violation of the foregoing violates these Legal Terms and may result in, among other
              things, termination or suspension of your rights to use the Services.
            </p>
          </Section>

          <Section id="license" title="Contribution license">
            <p>
              By posting your Contributions to any part of the Services, you automatically grant, and you represent and
              warrant that you have the right to grant, to us an unrestricted, unlimited, irrevocable, perpetual,
              non-exclusive, transferable, royalty-free, fully-paid, worldwide right, and license to host, use, copy,
              reproduce, disclose, sell, resell, publish, broadcast, retitle, archive, store, cache, publicly perform, publicly
              display, reformat, translate, transmit, excerpt (in whole or in part), and distribute such Contributions
              (including, without limitation, your image and voice) for any purpose, commercial, advertising, or otherwise, and
              to prepare derivative works of, or incorporate into other works, such Contributions, and grant and authorize
              sublicenses of the foregoing. The use and distribution may occur in any media formats and through any media
              channels.
            </p>
            <p>
              This license will apply to any form, media, or technology now known or hereafter developed, and includes our use
              of your name, company name, and franchise name, as applicable, and any of the trademarks, service marks, trade
              names, logos, and personal and commercial images you provide. You waive all moral rights in your Contributions,
              and you warrant that moral rights have not otherwise been asserted in your Contributions.
            </p>
            <p>
              We do not assert any ownership over your Contributions. You retain full ownership of all of your Contributions
              and any intellectual property rights or other proprietary rights associated with your Contributions. We are not
              liable for any statements or representations in your Contributions provided by you in any area on the Services.
              You are solely responsible for your Contributions to the Services and you expressly agree to exonerate us from
              any and all responsibility and to refrain from any legal action against us regarding your Contributions.
            </p>
            <p>
              We have the right, in our sole and absolute discretion, (1) to edit, redact, or otherwise change any
              Contributions; (2) to re-categorize any Contributions to place them in more appropriate locations on the
              Services; and (3) to pre-screen or delete any Contributions at any time and for any reason, without notice. We
              have no obligation to monitor your Contributions.
            </p>
          </Section>

          <Section id="reviews" title="Guidelines for reviews">
            <p>
              We may provide you areas on the Services to leave reviews or ratings. When posting a review, you must comply with
              the following criteria: (1) you should have firsthand experience with the person/entity being reviewed; (2) your
              reviews should not contain offensive profanity, or abusive, racist, offensive, or hateful language; (3) your
              reviews should not contain discriminatory references based on religion, race, gender, national origin, age,
              marital status, sexual orientation, or disability; (4) your reviews should not contain references to illegal
              activity; (5) you should not be affiliated with competitors if posting negative reviews; (6) you should not make
              any conclusions as to the legality of conduct; (7) you may not post any false or misleading statements; and (8)
              you may not organize a campaign encouraging others to post reviews, whether positive or negative.
            </p>
            <p>
              We may accept, reject, or remove reviews in our sole discretion. We have absolutely no obligation to screen
              reviews or to delete reviews, even if anyone considers reviews objectionable or inaccurate. Reviews are not
              endorsed by us, and do not necessarily represent our opinions or the views of any of our affiliates or partners.
              We do not assume liability for any review or for any claims, liabilities, or losses resulting from any review. By
              posting a review, you hereby grant to us a perpetual, non-exclusive, worldwide, royalty-free, fully paid,
              assignable, and sublicensable right and license to reproduce, modify, translate, transmit by any means, display,
              perform, and/or distribute all content relating to review.
            </p>
          </Section>

          <Section id="mobile" title="Mobile application license">
            <Sub title="Use license">
              <p>
                If you access the Services via the App, then we grant you a revocable, non-exclusive, non-transferable,
                limited right to install and use the App on wireless electronic devices owned or controlled by you, and to
                access and use the App on such devices strictly in accordance with the terms and conditions of this mobile
                application license contained in these Legal Terms. You shall not: (1) except as permitted by applicable law,
                decompile, reverse engineer, disassemble, attempt to derive the source code of, or decrypt the App; (2) make
                any modification, adaptation, improvement, enhancement, translation, or derivative work from the App; (3)
                violate any applicable laws, rules, or regulations in connection with your access or use of the App; (4)
                remove, alter, or obscure any proprietary notice (including any notice of copyright or trademark) posted by us
                or the licensors of the App; (5) use the App for any revenue-generating endeavor, commercial enterprise, or
                other purpose for which it is not designed or intended; (6) make the App available over a network or other
                environment permitting access or use by multiple devices or users at the same time; (7) use the App for
                creating a product, service, or software that is, directly or indirectly, competitive with or in any way a
                substitute for the App; (8) use the App to send automated queries to any website or to send any unsolicited
                commercial email; or (9) use any proprietary information or any of our interfaces or our other intellectual
                property in the design, development, manufacture, licensing, or distribution of any applications, accessories,
                or devices for use with the App.
              </p>
            </Sub>
            <Sub title="Apple and Android devices">
              <p>
                The following terms apply when you use the App obtained from either the Apple Store or Google Play (each an
                &ldquo;App Distributor&rdquo;) to access the Services: (1) the license granted to you for our App is limited to
                a non-transferable license to use the application on a device that utilizes the Apple iOS or Android operating
                systems, as applicable, and in accordance with the usage rules set forth in the applicable App
                Distributor&rsquo;s terms of service; (2) we are responsible for providing any maintenance and support services
                with respect to the App as specified in the terms and conditions of this mobile application license contained
                in these Legal Terms or as otherwise required under applicable law, and you acknowledge that each App
                Distributor has no obligation whatsoever to furnish any maintenance and support services with respect to the
                App; (3) in the event of any failure of the App to conform to any applicable warranty, you may notify the
                applicable App Distributor, and the App Distributor, in accordance with its terms and policies, may refund the
                purchase price, if any, paid for the App, and to the maximum extent permitted by applicable law, the App
                Distributor will have no other warranty obligation whatsoever with respect to the App; (4) you represent and
                warrant that (i) you are not located in a country that is subject to a US government embargo, or that has been
                designated by the US government as a &ldquo;terrorist supporting&rdquo; country and (ii) you are not listed on
                any US government list of prohibited or restricted parties; (5) you must comply with applicable third-party
                terms of agreement when using the App, e.g., if you have a VoIP application, then you must not be in violation
                of their wireless data service agreement when using the App; and (6) you acknowledge and agree that the App
                Distributors are third-party beneficiaries of the terms and conditions in this mobile application license
                contained in these Legal Terms, and that each App Distributor will have the right (and will be deemed to have
                accepted the right) to enforce the terms and conditions in this mobile application license contained in these
                Legal Terms against you as a third-party beneficiary thereof.
              </p>
            </Sub>
          </Section>

          <Section id="thirdparty" title="Third-party websites and content">
            <p>
              The Services may contain (or you may be sent via the Site or App) links to other websites (&ldquo;Third-Party
              Websites&rdquo;) as well as articles, photographs, text, graphics, pictures, designs, music, sound, video,
              information, applications, software, and other content or items belonging to or originating from third parties
              (&ldquo;Third-Party Content&rdquo;). Such Third-Party Websites and Third-Party Content are not investigated,
              monitored, or checked for accuracy, appropriateness, or completeness by us, and we are not responsible for any
              Third-Party Websites accessed through the Services or any Third-Party Content posted on, available through, or
              installed from the Services, including the content, accuracy, offensiveness, opinions, reliability, privacy
              practices, or other policies of or contained in the Third-Party Websites or the Third-Party Content. Inclusion
              of, linking to, or permitting the use or installation of any Third-Party Websites or any Third-Party Content does
              not imply approval or endorsement thereof by us. If you decide to leave the Services and access the Third-Party
              Websites or to use or install any Third-Party Content, you do so at your own risk, and you should be aware these
              Legal Terms no longer govern. You should review the applicable terms and policies, including privacy and data
              gathering practices, of any website to which you navigate from the Services or relating to any applications you
              use or install from the Services. Any purchases you make through Third-Party Websites will be through other
              websites and from other companies, and we take no responsibility whatsoever in relation to such purchases which
              are exclusively between you and the applicable third party. You agree and acknowledge that we do not endorse the
              products or services offered on Third-Party Websites and you shall hold us blameless from any harm caused by your
              purchase of such products or services. Additionally, you shall hold us blameless from any losses sustained by you
              or harm caused to you relating to or resulting in any way from any Third-Party Content or any contact with
              Third-Party Websites.
            </p>
          </Section>

          <Section id="sitemanage" title="Services management">
            <p>
              We reserve the right, but not the obligation, to: (1) monitor the Services for violations of these Legal Terms;
              (2) take appropriate legal action against anyone who, in our sole discretion, violates the law or these Legal
              Terms, including without limitation, reporting such user to law enforcement authorities; (3) in our sole
              discretion and without limitation, refuse, restrict access to, limit the availability of, or disable (to the
              extent technologically feasible) any of your Contributions or any portion thereof; (4) in our sole discretion and
              without limitation, notice, or liability, to remove from the Services or otherwise disable all files and content
              that are excessive in size or are in any way burdensome to our systems; and (5) otherwise manage the Services in a
              manner designed to protect our rights and property and to facilitate the proper functioning of the Services.
            </p>
          </Section>

          <Section id="privacy" title="Privacy policy">
            <p>
              We care about data privacy and security. Please review our <PrivacyLink />. By using the Services, you agree to
              be bound by our Privacy Policy, which is incorporated into these Legal Terms. Please be advised the Services are
              hosted in the United States. If you access the Services from any other region of the world with laws or other
              requirements governing personal data collection, use, or disclosure that differ from applicable laws in the
              United States, then through your continued use of the Services, you are transferring your data to the United
              States, and you expressly consent to have your data transferred to and processed in the United States.
            </p>
          </Section>

          <Section id="copyright" title="Copyright infringements">
            <p>
              We respect the intellectual property rights of others. If you believe that any material available on or through
              the Services infringes upon any copyright you own or control, please immediately notify us using the contact
              information provided below (a &ldquo;Notification&rdquo;). A copy of your Notification will be sent to the person
              who posted or stored the material addressed in the Notification. Please be advised that pursuant to applicable
              law you may be held liable for damages if you make material misrepresentations in a Notification. Thus, if you are
              not sure that material located on or linked to by the Services infringes your copyright, you should consider
              first contacting an attorney.
            </p>
          </Section>

          <Section id="termination" title="Term and termination">
            <p>
              These Legal Terms shall remain in full force and effect while you use the Services. WITHOUT LIMITING ANY OTHER
              PROVISION OF THESE LEGAL TERMS, WE RESERVE THE RIGHT TO, IN OUR SOLE DISCRETION AND WITHOUT NOTICE OR LIABILITY,
              DENY ACCESS TO AND USE OF THE SERVICES (INCLUDING BLOCKING CERTAIN IP ADDRESSES), TO ANY PERSON FOR ANY REASON OR
              FOR NO REASON, INCLUDING WITHOUT LIMITATION FOR BREACH OF ANY REPRESENTATION, WARRANTY, OR COVENANT CONTAINED IN
              THESE LEGAL TERMS OR OF ANY APPLICABLE LAW OR REGULATION. WE MAY TERMINATE YOUR USE OR PARTICIPATION IN THE
              SERVICES OR DELETE YOUR ACCOUNT AND ANY CONTENT OR INFORMATION THAT YOU POSTED AT ANY TIME, WITHOUT WARNING, IN OUR
              SOLE DISCRETION.
            </p>
            <p>
              If we terminate or suspend your account for any reason, you are prohibited from registering and creating a new
              account under your name, a fake or borrowed name, or the name of any third party, even if you may be acting on
              behalf of the third party. In addition to terminating or suspending your account, we reserve the right to take
              appropriate legal action, including without limitation pursuing civil, criminal, and injunctive redress.
            </p>
          </Section>

          <Section id="modifications" title="Modifications and interruptions">
            <p>
              We reserve the right to change, modify, or remove the contents of the Services at any time or for any reason at
              our sole discretion without notice. However, we have no obligation to update any information on our Services. We
              also reserve the right to modify or discontinue all or part of the Services without notice at any time. We will
              not be liable to you or any third party for any modification, price change, suspension, or discontinuance of the
              Services.
            </p>
            <p>
              We cannot guarantee the Services will be available at all times. We may experience hardware, software, or other
              problems or need to perform maintenance related to the Services, resulting in interruptions, delays, or errors. We
              reserve the right to change, revise, update, suspend, discontinue, or otherwise modify the Services at any time or
              for any reason without notice to you. You agree that we have no liability whatsoever for any loss, damage, or
              inconvenience caused by your inability to access or use the Services during any downtime or discontinuance of the
              Services. Nothing in these Legal Terms will be construed to obligate us to maintain and support the Services or to
              supply any corrections, updates, or releases in connection therewith.
            </p>
          </Section>

          <Section id="law" title="Governing law">
            <p>
              These Legal Terms and your use of the Services are governed by and construed in accordance with the laws of the
              State of Georgia applicable to agreements made and to be entirely performed within the State of Georgia, without
              regard to its conflict of law principles.
            </p>
          </Section>

          <Section id="disputes" title="Dispute resolution">
            <p>
              Any legal action arising out of or relating to these Legal Terms, the Services, bookings, payments, or your
              relationship with Tydio shall be brought in a state court of competent jurisdiction in Fulton County, Georgia, or
              the federal court having jurisdiction over Fulton County, Georgia. You and Tydio consent to the personal
              jurisdiction of those courts and, to the extent permitted by law, waive objections to venue or inconvenient
              forum. This provision is subject to any nonwaivable right to bring a claim in another court or venue and does not
              restrict access to a small claims court where applicable law requires that option.
            </p>
            <p>
              These Legal Terms do not require mediation or arbitration and do not impose a class action, collective action,
              representative action, or jury trial waiver. Nothing in these Legal Terms restricts reporting to, filing charges
              with, or participating in proceedings before a government agency or exercising any other nonwaivable right.
            </p>
            <p>
              Application of the United Nations Convention on Contracts for the International Sale of Goods and the Uniform
              Computer Information Transaction Act (UCITA) is excluded from these Legal Terms.
            </p>
          </Section>

          <Section id="corrections" title="Corrections">
            <p>
              There may be information on the Services that contains typographical errors, inaccuracies, or omissions,
              including descriptions, pricing, availability, and various other information. We reserve the right to correct any
              errors, inaccuracies, or omissions and to change or update the information on the Services at any time, without
              prior notice.
            </p>
          </Section>

          <Section id="disclaimer" title="Disclaimer">
            <p>
              THE SERVICES ARE PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. YOU AGREE THAT YOUR USE OF THE SERVICES WILL BE AT
              YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN
              CONNECTION WITH THE SERVICES AND YOUR USE THEREOF, INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE MAKE NO WARRANTIES OR REPRESENTATIONS
              ABOUT THE ACCURACY OR COMPLETENESS OF THE SERVICES&apos; CONTENT OR THE CONTENT OF ANY WEBSITES OR MOBILE
              APPLICATIONS LINKED TO THE SERVICES AND WE WILL ASSUME NO LIABILITY OR RESPONSIBILITY FOR ANY (1) ERRORS,
              MISTAKES, OR INACCURACIES OF CONTENT AND MATERIALS, (2) PERSONAL INJURY OR PROPERTY DAMAGE, OF ANY NATURE
              WHATSOEVER, RESULTING FROM YOUR ACCESS TO AND USE OF THE SERVICES, (3) ANY UNAUTHORIZED ACCESS TO OR USE OF OUR
              SECURE SERVERS AND/OR ANY AND ALL PERSONAL INFORMATION AND/OR FINANCIAL INFORMATION STORED THEREIN, (4) ANY
              INTERRUPTION OR CESSATION OF TRANSMISSION TO OR FROM THE SERVICES, (5) ANY BUGS, VIRUSES, TROJAN HORSES, OR THE
              LIKE WHICH MAY BE TRANSMITTED TO OR THROUGH THE SERVICES BY ANY THIRD PARTY, AND/OR (6) ANY ERRORS OR OMISSIONS IN
              ANY CONTENT AND MATERIALS OR FOR ANY LOSS OR DAMAGE OF ANY KIND INCURRED AS A RESULT OF THE USE OF ANY CONTENT
              POSTED, TRANSMITTED, OR OTHERWISE MADE AVAILABLE VIA THE SERVICES. WE DO NOT WARRANT, ENDORSE, GUARANTEE, OR ASSUME
              RESPONSIBILITY FOR ANY PRODUCT OR SERVICE ADVERTISED OR OFFERED BY A THIRD PARTY THROUGH THE SERVICES, ANY
              HYPERLINKED WEBSITE, OR ANY WEBSITE OR MOBILE APPLICATION FEATURED IN ANY BANNER OR OTHER ADVERTISING, AND WE ARE
              NOT THE PROVIDER OF THIRD-PARTY CLEANING SERVICES. OUR BOOKING, PAYMENT, SUPPORT, AND REFUND OBLIGATIONS EXPRESSLY
              STATED IN THESE LEGAL TERMS REMAIN IN EFFECT. AS WITH THE PURCHASE OF A PRODUCT OR SERVICE THROUGH ANY MEDIUM OR IN ANY
              ENVIRONMENT, YOU SHOULD USE YOUR BEST JUDGMENT AND EXERCISE CAUTION WHERE APPROPRIATE.
            </p>
          </Section>

          <Section id="liability" title="Limitations of liability">
            <p>
              IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT,
              INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT, LOST
              REVENUE, LOSS OF DATA, OR OTHER DAMAGES ARISING FROM YOUR USE OF THE SERVICES, EVEN IF WE HAVE BEEN ADVISED OF
              THE POSSIBILITY OF SUCH DAMAGES. NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED HEREIN, OUR LIABILITY TO YOU
              FOR ANY CAUSE WHATSOEVER AND REGARDLESS OF THE FORM OF THE ACTION, WILL AT ALL TIMES BE LIMITED TO $1,000.00 USD.
              CERTAIN US STATE LAWS AND INTERNATIONAL LAWS DO NOT ALLOW LIMITATIONS ON IMPLIED WARRANTIES OR THE EXCLUSION OR
              LIMITATION OF CERTAIN DAMAGES. IF THESE LAWS APPLY TO YOU, SOME OR ALL OF THE ABOVE DISCLAIMERS OR LIMITATIONS MAY
              NOT APPLY TO YOU, AND YOU MAY HAVE ADDITIONAL RIGHTS.
            </p>
            <p>
              The exclusions and $1,000.00 USD aggregate liability cap above do not apply to Tydio&rsquo;s fraud, willful
              misconduct, gross negligence, or liability that applicable law prohibits limiting or excluding. They do not
              eliminate nonwaivable statutory remedies or Tydio&rsquo;s express refund obligations under{' '}
              <SectionLink id="refunds">Section 7</SectionLink>.
            </p>
          </Section>

          <Section id="indemnification" title="Indemnification">
            <p>
              You agree to defend, indemnify, and hold us harmless, including our subsidiaries, affiliates, and all of our
              respective officers, agents, partners, and employees, from and against any loss, damage, liability, claim, or
              demand, including reasonable attorneys&rsquo; fees and expenses, made by any third party due to or arising out
              of: (1) your Contributions; (2) use of the Services; (3) breach of these Legal Terms; (4) any breach of your
              representations and warranties set forth in these Legal Terms; (5) your violation of the rights of a third party,
              including but not limited to intellectual property rights; or (6) any overt harmful act toward any other user of
              the Services with whom you connected via the Services. Notwithstanding the foregoing, we reserve the right, at
              your expense, to assume the exclusive defense and control of any matter for which you are required to indemnify
              us, and you agree to cooperate, at your expense, with our defense of such claims. We will use reasonable efforts
              to notify you of any such claim, action, or proceeding which is subject to this indemnification upon becoming
              aware of it.
            </p>
            <p>
              The indemnification above applies only to the extent permitted by law and does not require indemnification for
              Tydio&rsquo;s own fraud, willful misconduct, gross negligence, or other liability that cannot lawfully be
              shifted. It does not override nonwaivable consumer or worker protections.
            </p>
          </Section>

          <Section id="userdata" title="User data">
            <p>
              We will maintain certain data that you transmit to the Services for the purpose of managing the performance of
              the Services, as well as data relating to your use of the Services. Although we perform regular routine backups of
              data, you are solely responsible for all data that you transmit or that relates to any activity you have
              undertaken using the Services. You agree that we shall have no liability to you for any loss or corruption of any
              such data, and you hereby waive any right of action against us arising from any such loss or corruption of such
              data.
            </p>
          </Section>

          <Section id="electronic" title="Electronic communications, transactions, and signatures">
            <p>
              Visiting the Services, sending us emails, and completing online forms constitute electronic communications. You
              consent to receive electronic communications, and you agree that all agreements, notices, disclosures, and other
              communications we provide to you electronically, via email and on the Services, satisfy any legal requirement
              that such communication be in writing. YOU HEREBY AGREE TO THE USE OF ELECTRONIC SIGNATURES, CONTRACTS, ORDERS,
              AND OTHER RECORDS, AND TO ELECTRONIC DELIVERY OF NOTICES, POLICIES, AND RECORDS OF TRANSACTIONS INITIATED OR
              COMPLETED BY US OR VIA THE SERVICES. You hereby waive any rights or requirements under any statutes, regulations,
              rules, ordinances, or other laws in any jurisdiction which require an original signature or delivery or
              retention of non-electronic records, or to payments or the granting of credits by any means other than electronic
              means.
            </p>
          </Section>

          <Section id="sms" title="SMS text messaging">
            <Sub title="Program description">
              <p>
                By opting into any Tydio text messaging program, you expressly consent to receive text messages (SMS) to your
                mobile number. Tydio text messages may include: booking requests, confirmations and changes, appointment
                reminders, service status updates, new message alerts, review requests and account alerts. We do not send
                marketing or promotional text messages. Message frequency varies.
              </p>
            </Sub>
            <Sub title="Opting out">
              <p>
                Users can opt out of text messages at any time by replying STOP to any Tydio text message, or by opening
                Settings in the Tydio app and turning off the text message notifications toggle.
              </p>
            </Sub>
            <Sub title="Message and data rates">
              <p>
                Please be aware that message and data rates may apply to any SMS messages sent or received. The rates are
                determined by your carrier and the specifics of your mobile plan. Carriers are not liable for delayed or
                undelivered messages. If you have any questions about your text plan or data plan, contact your wireless
                provider.
              </p>
            </Sub>
            <Sub title="Support">
              <p>
                If you have any questions or need assistance regarding our SMS communications, please reply with the keyword
                HELP. You can also email us at <EmailLink /> or call at <PhoneLink />. If you have any questions regarding
                privacy, please read our <PrivacyLink />.
              </p>
            </Sub>
          </Section>

          <Section id="california" title="California users and residents">
            <p>
              If any complaint with us is not satisfactorily resolved, you can contact the Complaint Assistance Unit of the
              Division of Consumer Services of the California Department of Consumer Affairs in writing at 1625 North Market
              Blvd., Suite N 112, Sacramento, California 95834 or by telephone at (800) 952-5210 or (916) 445-1254.
            </p>
          </Section>

          <Section id="misc" title="Miscellaneous">
            <p>
              These Legal Terms and any policies or operating rules posted by us on the Services or in respect to the Services
              constitute the entire agreement and understanding between you and us. Our failure to exercise or enforce any right
              or provision of these Legal Terms shall not operate as a waiver of such right or provision. These Legal Terms
              operate to the fullest extent permissible by law. We may assign any or all of our rights and obligations to others
              at any time. We shall not be responsible or liable for any loss, damage, delay, or failure to act caused by any
              cause beyond our reasonable control. If any provision or part of a provision of these Legal Terms is determined to
              be unlawful, void, or unenforceable, that provision or part of the provision is deemed severable from these Legal
              Terms and does not affect the validity and enforceability of any remaining provisions. There is no joint venture,
              partnership, employment or agency relationship created between you and us as a result of these Legal Terms or use
              of the Services. You agree that these Legal Terms will not be construed against us by virtue of having drafted
              them. You hereby waive any and all defenses you may have based on the electronic form of these Legal Terms and the
              lack of signing by the parties hereto to execute these Legal Terms.
            </p>
          </Section>

          <Section id="contact" title="Contact us">
            <p>
              In order to resolve a complaint regarding the Services or to receive further information regarding use of the
              Services, please contact us at:
            </p>
            <address className="not-italic rounded-2xl border border-slate-100 bg-slate-50 p-6 space-y-1">
              <p className="font-semibold text-slate-900">Tydio LLC</p>
              <p>3133 Maple Dr, Ste 240</p>
              <p>Atlanta, GA 30305</p>
              <p>United States</p>
              <p>Phone: <PhoneLink /></p>
              <p><EmailLink /></p>
            </address>
          </Section>

        </article>
      </main>

      <Footer />
    </>
  )
}
