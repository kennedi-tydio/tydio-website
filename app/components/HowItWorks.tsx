import Image from "next/image";

const steps = [
  {
    number: "01",
    title: "Create your task list",
    description:
      "Tell us exactly what needs doing — you write the tasks, so your cleaner knows precisely what to tackle.",
    image: "/Choose tasks.png",
  },
  {
    number: "02",
    title: "Pick your cleaner",
    description:
      "Browse available local cleaning pros in your area and choose the one that works best for you.",
    image: "/Choose Tidy Pro.png",
  },
  {
    number: "03",
    title: "They show up & get it done",
    description:
      "Your pro arrives and handles exactly what you booked — no upsells, no surprises. Pay the flat price you agreed to. That's it.",
    image: "/Tidy Pro Progress.png",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 md:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-sky-500 text-sm font-semibold uppercase tracking-widest mb-3">
            How It Works
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
            Three steps to a cleaner home
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative p-8 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col"
            >
              <Image
                src={step.image}
                alt={step.title}
                width={390}
                height={844}
                className="w-full h-auto rounded-2xl shadow-md mb-6"
              />
              <span className="text-6xl font-black text-sky-100 select-none leading-none">
                {step.number}
              </span>
              <h3 className="mt-3 text-xl font-bold text-slate-900">
                {step.title}
              </h3>
              <p className="mt-2 text-slate-500 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
