import Link from "next/link";

// Last section on the home page, after Pricing: for visitors who scrolled all the way
// down and are ready to go. Signed-in customers go straight to their tasks, where a
// booking starts; everyone else creates an account first. Tidy Pros book from a
// separate customer account, so they aren't shown it.
export default function ReadyToBookCta({ role }: { role: "USER" | "TIDYPRO" | "ADMIN" | null }) {
  if (role === "TIDYPRO" || role === "ADMIN") return <LaunchNote className="py-10 bg-slate-50 border-t border-slate-100" />;

  const signedIn = role === "USER";

  return (
    <section aria-labelledby="ready-to-book-heading" className="py-16 md:py-20 bg-slate-50 border-t border-slate-100">
      <div className="max-w-2xl mx-auto px-6 text-center">
        <h2 id="ready-to-book-heading" className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
          Ready to book?
        </h2>
        <p className="mt-3 text-slate-500 text-lg">
          {signedIn
            ? "Add the tasks you want done, pick a time, and choose your Tidy Pro."
            : "Create an account to save your spot. We're opening in Georgia first and letting people in a few at a time, and we'll email you as soon as you can book."}
        </p>
        <Link
          href={signedIn ? "/dashboard" : "/signup"}
          className="mt-8 inline-flex items-center justify-center bg-brand hover:opacity-90 text-white font-semibold px-8 py-3.5 rounded-full shadow-sm transition-opacity text-base"
        >
          Ready to book
        </Link>
        <LaunchNote className="mt-8" />
      </div>
    </section>
  );
}

function LaunchNote({ className }: { className?: string }) {
  return (
    <p className={`text-center text-sm font-semibold text-slate-700 ${className ?? ""}`}>
      Officially launching in Atlanta November 22, 2026
    </p>
  );
}
