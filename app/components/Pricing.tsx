const exampleTasks = [
  "Vacuum living room",
  "Wipe down kitchen counters",
  "Clean bathroom sink & mirror",
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-16 md:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sky-500 text-sm font-semibold uppercase tracking-widest mb-3">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
            Pay for what you actually need
          </h2>
          <p className="mt-4 text-slate-500 text-lg max-w-xl mx-auto">
            Why pay for a full cleaning when you only need a few things done?
            Pick your tasks and get a flat price — nothing more.
          </p>
        </div>

        <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8 items-center">
          {/* Tier card */}
          <div className="rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col gap-4">
            <div className="text-3xl">⚡</div>
            <div>
              <h3 className="text-2xl font-bold text-slate-900">Quick Reset</h3>
              <p className="text-sm text-slate-400 mt-0.5">Under 1 hour</p>
            </div>
            <p className="text-4xl font-black text-slate-900 tracking-tight">$39–$59</p>
            <p className="text-slate-500 text-sm leading-relaxed">
              A fast spruce-up for when a couple of things need attention — without booking a cleaner for half the day.
            </p>
          </div>

          {/* Example booking */}
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-8 flex flex-col gap-5">
            <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Example booking</p>
            <ul className="flex flex-col gap-3">
              {exampleTasks.map((task) => (
                <li key={task} className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sky-100 text-sky-500 flex items-center justify-center">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-slate-700 font-medium">{task}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
              <span className="text-slate-500 text-sm">Total</span>
              <span className="text-2xl font-black text-sky-500">$49</span>
            </div>
            <p className="text-xs text-slate-400">
              Instead of paying $150+ for a full clean you didn't need.
            </p>
          </div>
        </div>

        <p className="text-center text-slate-400 text-sm mt-8">
          Exact price confirmed before booking. No surprises.
        </p>
      </div>
    </section>
  );
}
