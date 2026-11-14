// Landing page FAQ. The home screen steps mirror the in-app guide in
// installGuide.ts (getInstallGuide); update both together.

import FaqLink from "./FaqLink";
import InstallDemo from "./InstallDemo";

const iphoneSteps = [
  "Open Tydio in Safari.",
  "Tap the ••• button next to the address bar at the bottom of the screen, then tap Share. (On iOS 18 or earlier, tap the Share button, a square with an arrow pointing up, in the toolbar.)",
  "Scroll down (tap View More if you see it) and tap Add to Home Screen.",
  "Leave Open as Web App turned on, then tap Add.",
];

const androidSteps = [
  "Open Tydio in Chrome.",
  "Tap the ⋮ menu at the top right of your browser.",
  "Tap Add to Home screen (it may say Install app).",
  "Tap Install, then Add if asked.",
];

function Question({ id, question, children }: { id: string; question: string; children: React.ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-24 border-b border-slate-200 py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        {question}
        <svg
          aria-hidden="true"
          className="w-5 h-5 flex-none text-slate-400 transition-transform group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="mt-4 flex flex-col gap-4 text-slate-600">{children}</div>
    </details>
  );
}

export default function FAQ() {
  return (
    <section id="faq" className="py-16 md:py-24 bg-white border-t border-slate-100">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-10">
          <p className="text-sky-500 text-sm font-semibold uppercase tracking-widest mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
            Questions? We&apos;ve got answers
          </h2>
        </div>

        <div className="border-t border-slate-200">
          <Question id="add-to-home-screen" question="How do I add Tydio to my homescreen?">
            <p>
              Adding Tydio to your home screen lets you open it in one tap like any other app, and get push
              notifications about your bookings.
            </p>
            <InstallDemo
              ios={{
                steps: iphoneSteps,
                note: "Push notifications need iOS 16.4 or later. You can update in Settings → General → Software Update.",
              }}
              android={{
                steps: androidSteps,
                note: "Using Samsung Internet? Tap the menu button (☰) at the bottom right, then Add page to → Home screen → Add.",
              }}
            />
            <p className="text-sm">
              Then open Tydio from your home screen. You may need to log in once more the first time.
            </p>
          </Question>

          <Question id="app-store" question="Where is the app in the app store?">
            <p>
              Tydio isn&apos;t in the App Store or Google Play Store right now. It&apos;s a progressive web app
              (PWA): a website that installs straight from your browser and works like an app. Once it&apos;s on
              your home screen, it gets its own icon, opens full screen without the browser bars, and can send
              you push notifications. There&apos;s nothing to download from a store, and it&apos;s always up to date.
            </p>
            <p>
              For Tydio to work like an app, follow the steps in{" "}
              <FaqLink target="add-to-home-screen">How do I add Tydio to my homescreen?</FaqLink>
            </p>
          </Question>
        </div>
      </div>
    </section>
  );
}
