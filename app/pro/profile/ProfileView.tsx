'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePostHog } from 'posthog-js/react'
import { logoutAction, deleteAccountAction } from '../actions'
import ModalShell from '@/app/components/ModalShell'

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
}

function IconUserActive() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-slate-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  )
}

function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  error,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  error?: string | null
}) {
  return (
    <ModalShell className="fixed inset-0 z-50 flex items-end justify-center" panelClassName="w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl" onClose={onCancel} labelledBy="confirm-sheet-title">
      <h2 id="confirm-sheet-title" className="font-bold text-slate-900 text-lg mb-1">{title}</h2>
      <p className="text-sm text-slate-500 mb-6">{body}</p>
      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 -mt-2 mb-6">{error}</p>}
      <div className="flex flex-col gap-3">
        <button
          onClick={onConfirm}
          className="w-full py-3 rounded-xl text-white font-semibold text-sm"
          style={{ backgroundColor: '#ef4444' }}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm"
        >
          Go back
        </button>
      </div>
    </ModalShell>
  )
}

type Props = {
  firstName: string
  lastName: string
  email: string
  location: string
  photoUrl: string | null
  pendingEarnings: number | null
  overallEarnings: number
  unreadMessageCount: number
}

function MenuLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="w-full bg-white rounded-2xl px-5 py-4 mb-3 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
    >
      <span className="font-semibold text-slate-800 text-sm">{label}</span>
      <IconChevronRight />
    </Link>
  )
}

export default function ProfileView({
  firstName,
  lastName,
  email,
  location,
  photoUrl,
  pendingEarnings,
  overallEarnings,
  unreadMessageCount,
}: Props) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const posthog = usePostHog()
  const [showLogout, setShowLogout] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  return (
    <main id="main-content" className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5f7fa' }}>
      <h1 className="sr-only">Profile</h1>
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-36 max-w-sm mx-auto w-full">

        {/* Profile card */}
        <div className="bg-white rounded-2xl p-5 mb-6 shadow-sm">
          <div className="flex items-center gap-4 pb-4 mb-4 border-b border-slate-200">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={fullName || email} className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                style={{ backgroundColor: 'var(--color-brand)' }}
              >
                {initials || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 text-lg leading-tight">{fullName || email}</p>
              {location && (
                <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                  {location}
                </p>
              )}
              <Link
                href="/pro/profile/edit"
                className="block w-full mt-2 py-1 rounded-full bg-slate-100 text-center text-xs font-medium text-slate-500 hover:bg-slate-200 transition-colors"
              >
                Edit
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm font-medium text-slate-800 mb-2">
            <span>Pending earnings</span>
            <span className="font-semibold" style={{ color: 'var(--color-brand)' }}>{pendingEarnings == null ? '—' : `$${pendingEarnings.toFixed(2)}`}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-medium text-slate-800">
            <span>Overall earnings</span>
            <span className="font-semibold" style={{ color: 'var(--color-brand)' }}>${overallEarnings.toFixed(2)}</span>
          </div>
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-3">Availability &amp; Pricing</h2>
        <MenuLink label="Availability calendar" href="/pro/profile/availability" />
        <MenuLink label="Payout methods" href="/pro/profile/payouts" />

        <h2 className="text-xl font-bold text-slate-900 mt-6 mb-3">Service Area</h2>
        <MenuLink label="Travel distance" href="/pro/profile/travel-distance" />

        <h2 className="text-xl font-bold text-slate-900 mt-6 mb-3">Settings</h2>
        <MenuLink label="Preferences" href="/pro/profile/notifications" />
        <MenuLink label="Accessibility" href="/pro/profile/accessibility" />
        <MenuLink label="Manage Address" href="/pro/profile/address" />
        <MenuLink label="Insurance" href="/pro/profile/insurance" />
        {/* A file download rather than a page, so a plain link instead of MenuLink */}
        <a
          href="/pro/onboarding/agreements/document?signed=1"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-white rounded-2xl px-5 py-4 mb-3 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <span className="font-semibold text-slate-800 text-sm">Signed contractor agreement</span>
          <IconChevronRight />
        </a>

        {/* Logout */}
        <button
          onClick={() => setShowLogout(true)}
          className="w-full bg-white rounded-2xl px-5 py-4 mb-3 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <span className="font-semibold text-slate-800 text-sm">Logout</span>
          <IconChevronRight />
        </button>

        {/* Delete account */}
        <button
          onClick={() => setShowDelete(true)}
          className="w-full bg-white rounded-2xl px-5 py-4 mb-3 shadow-sm flex items-center justify-between hover:bg-red-50 transition-colors"
        >
          <span className="font-semibold text-red-500 text-sm">Delete Account</span>
          <IconChevronRight />
        </button>
      </div>

      {/* Bottom nav */}
      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome />, label: 'Home', href: '/pro/dashboard', active: false, badge: 0 },
            { icon: <IconCalendar />, label: 'Bookings', href: '/pro/bookings', active: false, badge: 0 },
            { icon: <IconMessage />, label: 'Messages', href: '/pro/messages', active: false, badge: unreadMessageCount },
            { icon: <IconUserActive />, label: 'Profile', href: '/pro/profile', active: true, badge: 0 },
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

      {/* Logout confirmation */}
      {showLogout && (
        <ConfirmSheet
          title="Log out of Tydio?"
          body="You'll need to sign back in to access your account."
          confirmLabel="Logout"
          onCancel={() => setShowLogout(false)}
          onConfirm={async () => { posthog?.reset(); await logoutAction() }}
        />
      )}

      {/* Delete account confirmation */}
      {showDelete && (
        <ConfirmSheet
          title="Delete your account?"
          body="This permanently deletes your account and personal information. This cannot be undone."
          confirmLabel="Delete Account"
          onCancel={() => { setShowDelete(false); setDeleteError(null) }}
          error={deleteError}
          onConfirm={async () => {
            posthog?.reset()
            const result = await deleteAccountAction()
            if (result?.error) setDeleteError(result.error)
          }}
        />
      )}
    </main>
  )
}
