import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-sky-100 rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-teal-100 rounded-full blur-3xl opacity-60" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-32 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-sky-50 border border-sky-100 text-sky-600 text-xs font-semibold px-4 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-sky-400 rounded-full" />
          Now accepting early access
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-slate-900 leading-[1.1] mb-6">
          Cleaning made{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-teal-400">
            simple
          </span>
          .
        </h1>

        {/* Subheadline */}
        <p className="max-w-xl mx-auto text-lg sm:text-xl text-slate-500 leading-relaxed mb-10">
          Get a local cleaning pro for exactly what needs doing — no full-service
          package required. Pay for the job, not the whole day.
        </p>

        {/* CTAs */}
        <div className="flex flex-col items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center bg-brand hover:opacity-90 text-white font-semibold px-8 py-3.5 rounded-full shadow-sm transition-opacity text-base"
          >
            Get Started
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium px-6 py-3.5 rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-base"
          >
            See how it works
          </a>
        </div>

        {/* Social proof */}
        <p className="mt-12 text-sm text-slate-400">
          No contracts. No hidden fees. Pay only for what you need.
        </p>
      </div>
    </section>
  );
}
