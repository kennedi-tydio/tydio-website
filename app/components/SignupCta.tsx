import Link from "next/link";

// Last section on the home page, after Pricing: a nudge to sign up for
// visitors who scrolled all the way down.
export default function SignupCta() {
  return (
    <section aria-labelledby="signup-cta-heading" className="py-16 md:py-20 bg-slate-50 border-t border-slate-100">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 id="signup-cta-heading" className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
          Want to try it out?
        </h2>
        <p className="mt-3 text-slate-500 text-lg">
          Create an account to save your spot. We&apos;re opening in Georgia first and letting people in
          a few at a time, and we&apos;ll email you as soon as you can book.
        </p>
        <Link
          href="/signup"
          className="mt-8 inline-flex items-center justify-center bg-brand hover:opacity-90 text-white font-semibold px-8 py-3.5 rounded-full shadow-sm transition-opacity text-base"
        >
          Create an account
        </Link>
      </div>
    </section>
  );
}
