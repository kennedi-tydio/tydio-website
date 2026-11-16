// Landing page FAQ: a few common questions and a search box. The full list is
// on /faq; both read app/components/faq/faqContent.ts.

import Link from "next/link";
import { FeaturedFaq } from "./faq/FaqBrowser";
import { FEATURED_FAQ_IDS } from "./faq/faqContent";

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

        <FeaturedFaq ids={FEATURED_FAQ_IDS} />

        <div className="mt-10 text-center">
          <Link
            href="/faq"
            className="inline-flex items-center gap-2 border border-sky-400 text-sky-600 hover:bg-sky-50 text-sm font-semibold px-5 py-2.5 rounded-full transition-colors"
          >
            See all FAQs
          </Link>
        </div>
      </div>
    </section>
  );
}
