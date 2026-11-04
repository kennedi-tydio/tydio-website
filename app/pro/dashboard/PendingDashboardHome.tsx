import Link from 'next/link'

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'var(--color-brand)' : 'none'} stroke={active ? 'var(--color-brand)' : 'var(--color-slate-400)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function IconCheckCircle() {
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-brand)' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </div>
  )
}

export default function PendingDashboardHome({
  firstName,
  unreadMessageCount,
  backgroundCheckFailed,
  backgroundCheckSubmitted,
}: {
  firstName: string
  unreadMessageCount: number
  backgroundCheckFailed: boolean
  backgroundCheckSubmitted: boolean
}) {
  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-28 max-w-sm mx-auto w-full">
        <p className="text-sm text-slate-500 mb-1">Welcome {firstName}</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-6">{backgroundCheckFailed ? 'Not Approved' : 'Pending'}</h1>

        {backgroundCheckFailed ? (
          <div className="rounded-2xl border border-slate-100 shadow-sm px-4 py-4 mb-8">
            <p className="text-sm font-bold text-slate-900 mb-1">Your background check was not approved</p>
            <p className="text-sm text-slate-500 leading-relaxed">
              You can&apos;t accept jobs on Tydio right now. Any notices about your report come from Checkr by email. Questions? Contact
              kennedicoats@tydioapp.com.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-100 shadow-sm px-4 py-4 flex items-center gap-3 mb-8">
              <IconCheckCircle />
              <p className="text-sm font-bold text-slate-900 flex-1">
                You will be notified when your background check is approved
              </p>
            </div>

            <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
              Once verified, you&apos;ll be able to:
            </p>
            <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1 mb-8">
              <li>Set up your payment info</li>
              <li>Choose your availability</li>
              <li>Start accepting cleaning tasks!</li>
            </ul>
          </>
        )}

        <h2 className="text-2xl font-bold text-slate-900 mb-3">Requested Actions</h2>
        {!backgroundCheckSubmitted && (
          <Link
            href="/pro/onboarding/setup/background-check"
            className="w-full bg-white rounded-2xl px-5 py-4 mb-3 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <span className="font-semibold text-slate-800 text-sm">Complete your background check</span>
            <IconChevronRight />
          </Link>
        )}
        <Link
          href="/pro/profile"
          className="w-full bg-white rounded-2xl px-5 py-4 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <span className="font-semibold text-slate-800 text-sm">Set up your profile</span>
          <IconChevronRight />
        </Link>
      </div>

      {/* ── Bottom navigation ── */}
      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 safe-area-inset-bottom">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome active />, label: 'Home', active: true, href: '/pro/dashboard', badge: 0 },
            { icon: <IconCalendar />, label: 'Bookings', active: false, href: '/pro/bookings', badge: 0 },
            { icon: <IconMessage />, label: 'Messages', active: false, href: '/pro/messages', badge: unreadMessageCount },
            { icon: <IconUser />, label: 'Profile', active: false, href: '/pro/profile', badge: 0 },
          ].map((item) => (
            <Link key={item.label} href={item.href} aria-current={item.active ? 'page' : undefined} className="flex flex-col items-center gap-0.5 px-3 py-1 relative">
              <span className="relative">
                {item.icon}
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium ${item.active ? 'text-brand' : 'text-slate-400'}`}>
                {item.label}
              </span>
              {item.active && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand" />
              )}
            </Link>
          ))}
        </div>
      </nav>
    </main>
  )
}
