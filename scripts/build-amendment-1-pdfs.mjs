// Builds each named Tidy Pro's copy of Amendment No. 1 to the Independent Contractor
// Agreement (lib/legal/amendment-1-*.pdf) by printing HTML with headless Chrome.
//
//   node scripts/build-amendment-1-pdfs.mjs
//
// The signature page (page 2) is laid out at fixed positions so AMENDMENT_1_LAYOUT in
// lib/legal/agreementAmendments.ts stays correct: with 72pt page margins, an element at
// `top: T` on that page sits at PDF y = 792 - 72 - T. If you move the Provider
// Signature or Date rows, update AMENDMENT_1_LAYOUT to match.
//
// Once a Tidy Pro has signed their copy, don't rebuild it: the signature records the
// document's SHA-256, so their copy must stay byte-for-byte what they signed.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const AMENDMENT_DATE = 'November 15, 2026'
const TYDIO_SIGNATURE = '/s/ Kennedi Coats'

const SIGNERS = [
  { slug: 'charonda', legalName: 'Charonda Winfield', businessEntity: 'Eco Cleaning by Sunshine LLC', acceptedOn: 'November 7, 2026' },
  { slug: 'lashauna', legalName: 'LaShauna Young', businessEntity: 'Shauna Boo’s cleaning service', acceptedOn: 'November 4, 2026' },
  // Kennedi's Tidy Pro test account (rvrblossom@gmail.com), for trying the flow.
  { slug: 'test', legalName: 'Kennedi Coats', businessEntity: '', acceptedOn: 'November 4, 2026' },
]

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function html({ legalName, businessEntity, acceptedOn }) {
  const entity = businessEntity ? ` (business entity: ${esc(businessEntity)})` : ''
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Amendment No. 1</title>
<style>
  @page { size: letter; margin: 72pt; @bottom-right { content: "Tydio Provider Agreement \\2014  Amendment No. 1  |  " counter(page); font: 8pt Calibri, Carlito, Arial, sans-serif; color: #64748b; } }
  body { margin: 0; font: 10.5pt/1.45 Calibri, Carlito, Arial, sans-serif; color: #1a2332; }
  h1 { font-size: 18pt; line-height: 1.2; margin: 0 0 4pt; }
  .sub { color: #64748b; margin: 0 0 14pt; }
  h2 { font-size: 12pt; margin: 14pt 0 4pt; }
  h3 { font-size: 10.5pt; margin: 10pt 0 3pt; }
  p { margin: 0 0 6pt; }
  .quote { margin: 0 0 6pt 18pt; color: #334155; }
  .sigpage { break-before: page; position: relative; height: 640pt; }
  .abs { position: absolute; left: 0; }
  .row { position: absolute; left: 0; width: 440pt; height: 16pt; }
  .label { position: absolute; left: 0; top: 0; }
  .value { position: absolute; left: 140pt; top: 0; width: 300pt; height: 16pt; padding-left: 4pt; box-sizing: border-box; }
  .line { border-bottom: 0.75pt solid #1a2332; }
  .sig { font: italic 13pt "Times New Roman", Times, serif; }
</style></head><body>
<h1>Amendment No. 1 to the Tidy Pro Independent Contractor and Platform Agreement</h1>
<p class="sub">Customer no-access waiting period and late customer cancellations &nbsp;|&nbsp; Amendment date: ${AMENDMENT_DATE}</p>

<h2>1 Parties</h2>
<p>This Amendment is between Tydio LLC, a Georgia limited liability company doing business as Tydio ("Tydio"), with a business address of 3133 Maple Dr, Ste 240, Atlanta, GA 30305, and:</p>
<p class="quote"><strong>${esc(legalName)}</strong>${entity} ("Provider"), who accepted the Agreement electronically on ${esc(acceptedOn)}.</p>
<p>This Amendment applies only to Provider and amends only Provider’s Agreement.</p>

<h2>2 Background</h2>
<p>Provider accepted the Tidy Pro Independent Contractor and Platform Agreement, agreement version 2026-11-04.2, including Schedule A (the "Agreement"). Section 13 of the Agreement provides that material changes to compensation require advance disclosure and affirmative acceptance before applying prospectively, and that other amendments must be recorded and accepted by both parties. Capitalized terms not defined in this Amendment have the meanings given in the Agreement.</p>

<h2>3 Amendments to Schedule A</h2>
<h3>3.1 Customer unavailable or no access</h3>
<p>In Schedule A, under "Customer unavailable or no access," the first sentence is deleted and replaced as follows.</p>
<p class="quote"><strong>Deleted:</strong> "Provider must wait until 15 minutes after the scheduled start time or Provider's actual arrival, whichever is later, before reporting “Customer unavailable—no access” through the platform."</p>
<p class="quote"><strong>Replaced with:</strong> "Provider must wait until 10 minutes after the scheduled start time or Provider's actual arrival, whichever is later, before reporting “Customer unavailable—no access” through the platform."</p>

<h3>3.2 Late customer cancellation of an accepted booking</h3>
<p>In Schedule A, the paragraph headed "Late customer cancellation of an accepted booking" is deleted in its entirety and replaced as follows.</p>
<p class="quote"><strong>Replaced with:</strong> "Late customer cancellation of an accepted booking: If the customer cancels less than 2 hours before the scheduled start, including after the scheduled start but before Provider arrives, the cancellation amount is 50% of the Service Price. Provider receives 80% of the cancellation amount (40% of the Service Price, which is 50% of the service earnings Provider would have received for the booking) and Tydio receives 20% of it (10% of the Service Price). Separately charged payment-processing fees are excluded from these percentages and are not deducted from Provider's compensation. The customer receives a refund of 50% of the amount paid. On a $200 Service Price, where Provider's service earnings would have been $160, Provider receives $80, Tydio receives $20, and the customer receives $100 of the Service Price back. Tips and taxes are not included in the Service Price or these compensation percentages."</p>

<h3>3.3 Early customer cancellation and unaccepted bookings</h3>
<p>In Schedule A, under "Early customer cancellation and unaccepted bookings," the first sentence is amended by replacing "12 or more hours" with "2 or more hours," so that it reads:</p>
<p class="quote"><strong>Replaced with:</strong> "A customer canceling 2 or more hours before the scheduled start receives the amount paid less the separately charged processing fee, subject to applicable law and processor rules; Provider receives no cancellation compensation."</p>

<h2>4 No other changes</h2>
<p>Except as stated in Section 3, the Agreement is unchanged and remains in full force and effect. In particular, the compensation following a valid no-access report and resolution (40% of the Service Price to Provider, 10% to Tydio, and 50% refunded to the customer), Provider's 80% service earnings on completed bookings, and the treatment of payment-processing fees outside Section 3.2 are not changed. If this Amendment conflicts with the Agreement, this Amendment controls.</p>

<h2>5 Effective date</h2>
<p>This Amendment takes effect on the date Provider signs or electronically accepts it, and applies prospectively to bookings Provider accepts on or after that date. It does not reduce earnings on bookings accepted before that date or alter any existing dispute.</p>

<div class="sigpage">
  <h2 class="abs" style="top:0;margin:0">6 Signatures</h2>
  <p class="abs" style="top:22pt;width:468pt">This Amendment may be accepted electronically and signed in counterparts, each of which is an original and all of which together are one instrument. Tydio will retain a copy of this Amendment with Provider’s acceptance record and make a copy available to Provider.</p>

  <div class="abs" style="top:110pt"><strong>Tydio LLC</strong></div>
  <div class="row" style="top:134pt"><span class="label">Authorized representative:</span><span class="value">Kennedi Coats</span></div>
  <div class="row" style="top:156pt"><span class="label">Title:</span><span class="value">Founder and CEO</span></div>
  <div class="row" style="top:178pt"><span class="label">Signature:</span><span class="value line sig">${TYDIO_SIGNATURE}</span></div>
  <div class="row" style="top:200pt"><span class="label">Date:</span><span class="value line">${AMENDMENT_DATE}</span></div>

  <div class="abs" style="top:244pt"><strong>Provider</strong></div>
  <div class="row" style="top:268pt"><span class="label">Legal name:</span><span class="value">${esc(legalName)}</span></div>
  <div class="row" style="top:290pt"><span class="label">Business entity:</span><span class="value">${esc(businessEntity || 'N/A')}</span></div>
  <div class="row" style="top:312pt"><span class="label">Signature:</span><span class="value line"></span></div>
  <div class="row" style="top:334pt"><span class="label">Date:</span><span class="value line"></span></div>
</div>
</body></html>`
}

const chrome = CHROME_PATHS.find((p) => {
  try {
    execFileSync(p, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}) ?? CHROME_PATHS[0]

const work = mkdtempSync(path.join(tmpdir(), 'amendment-1-'))
for (const signer of SIGNERS) {
  const source = path.join(work, `${signer.slug}.html`)
  writeFileSync(source, html(signer))
  const out = path.resolve('lib', 'legal', `amendment-1-${signer.slug}.pdf`)
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${out}`, pathToFileURL(source).href], { stdio: 'ignore' })
  console.log(`Wrote ${out}`)
}
