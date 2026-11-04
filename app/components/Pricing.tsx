// Mirrors the live price model in lib/pricingRules.ts. The example is a real
// quote: Georgia's $215 median 4-hour clean, so 42 minutes of tasks is
// 42 / 240 × $215 = $37.63 before surcharges and the home size multiplier.
// Cleaning fees combine the cleaning-level surcharges and extra issues
// ($5 standard + $10 heavy + $10 hard water stains). Update if pricing changes.
const exampleTasks = [
  { name: "Vacuum living room", detail: "Light touch-up" },
  { name: "Wipe down kitchen counters", detail: "Standard cleaning" },
  { name: "Scrub bathroom", detail: "Heavy cleaning · Hard water stains" },
];

const exampleLines = [
  { label: "Base price (42 min of tasks)", value: "$37.63" },
  { label: "Cleaning fees", value: "+$25.00" },
  { label: "Home size: 1,000–1,999 sqft (+10%)", value: "+$6.26" },
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
            Your price is based on the time your tasks take, how messy they are, and the size of your home.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          {/* Example booking */}
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-8 flex flex-col gap-5">
            <div>
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Example booking</p>
              <p className="text-xs text-slate-400 mt-1">Atlanta, GA · 1,500 sqft home</p>
            </div>
            <ul className="flex flex-col gap-3">
              {exampleTasks.map((task) => (
                <li key={task.name} className="flex items-start gap-3">
                  <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-sky-100 text-sky-500 flex items-center justify-center">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>
                    <span className="block text-slate-700 font-medium">{task.name}</span>
                    <span className="block text-xs text-slate-400">{task.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="border-t border-slate-200 pt-4 flex flex-col gap-2">
              {exampleLines.map((line) => (
                <div key={line.label} className="flex items-baseline justify-between gap-4 text-sm">
                  <dt className="text-slate-500">{line.label}</dt>
                  <dd className="text-slate-700 tabular-nums">{line.value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
              <span className="text-slate-500 text-sm">Total</span>
              <span className="text-2xl font-black text-sky-500">$68.89</span>
            </div>
            <p className="text-xs text-slate-400">
              Instead of paying $250+ for a full clean you didn&apos;t need.
            </p>
          </div>
        </div>

        <p className="text-center text-slate-400 text-sm mt-8 max-w-2xl mx-auto">
          Exact price confirmed before booking. No surprises. A card processing fee is added at checkout,
          and top-rated or farther-away Tidy Pros may add $5.
        </p>
      </div>
    </section>
  );
}
