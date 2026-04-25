export default function Waitlist() {
  return (
    <section id="waitlist" className="py-16 md:py-24 bg-gradient-to-br from-sky-500 to-teal-400">
      <div className="max-w-xl mx-auto px-6 text-center">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
          Be first in line.
        </h2>
        <p className="text-sky-100 text-lg mb-10">
          Tydio is launching soon. Join the waitlist and get early access.
        </p>

        <a
          href="https://tally.so/r/3XANPz"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold px-8 py-4 rounded-full transition-colors shadow-sm text-base"
        >
          Join the Waitlist
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>

        <p className="mt-6 text-sky-100/70 text-xs">
          No spam. Unsubscribe anytime.
        </p>
      </div>
    </section>
  );
}
