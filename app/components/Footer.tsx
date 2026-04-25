import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-white text-slate-400 py-10 border-t border-slate-100">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <a href="#">
          <Image src="/Tydio Logo No Bkg.png" alt="Tydio" width={80} height={29} />
        </a>
        <p>© {new Date().getFullYear()} Tydio. All rights reserved.</p>
        <a href="mailto:kennedicoats@tydioapp.com" className="flex items-center gap-2 hover:text-slate-900 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          kennedicoats@tydioapp.com
        </a>
      </div>
    </footer>
  );
}
