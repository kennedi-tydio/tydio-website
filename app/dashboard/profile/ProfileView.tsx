'use client'

import { useState } from 'react'
import Link from 'next/link'
import DownloadAppCard from '@/app/components/DownloadAppCard'
import { usePostHog } from 'posthog-js/react'
import { logoutAction, deleteAccountAction, updateCustomerAboutAction } from '../actions'
import ModalShell from '@/app/components/ModalShell'
import BugReportSheet from '@/app/components/BugReportSheet'
import { useRouter } from '@/app/components/NavigationSpinner'
import { CUSTOMER_BIO_MAX_LENGTH, CUSTOMER_PREFERENCES_MAX_LENGTH } from '@/lib/customerAbout'

const TEXTAREA_CLASS =
  'w-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand resize-none'

// Bio and cleaning preferences, which Tidy Pros see on this customer's profile.
function EditAboutSheet({
  initialBio,
  initialPreferences,
  onClose,
}: {
  initialBio: string
  initialPreferences: string
  onClose: () => void
}) {
  const router = useRouter()
  const [bio, setBio] = useState(initialBio)
  const [preferences, setPreferences] = useState(initialPreferences)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const result = await updateCustomerAboutAction({ bio, preferences })
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <ModalShell
      className="fixed inset-0 z-50 flex items-end justify-center"
      panelClassName="w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl max-h-[90dvh] overflow-y-auto"
      onClose={onClose}
      labelledBy="edit-about-title"
    >
      <h2 id="edit-about-title" className="font-bold text-slate-900 text-lg mb-1">Edit profile</h2>
      <p className="text-sm text-slate-500 mb-5">Tidy Pros you book can see your bio and preferences.</p>

      <label className="block mb-4">
        <span className="block text-xs font-semibold text-slate-500 mb-1.5">Bio</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={CUSTOMER_BIO_MAX_LENGTH}
          rows={3}
          placeholder="Write a short bio to help cleaners get to know you..."
          className={TEXTAREA_CLASS}
        />
      </label>

      <label className="block mb-5">
        <span className="block text-xs font-semibold text-slate-500 mb-1.5">Cleaning preferences</span>
        <textarea
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          maxLength={CUSTOMER_PREFERENCES_MAX_LENGTH}
          rows={4}
          placeholder="E.g. please take shoes off inside, unscented products only, don't move papers on the desk"
          className={TEXTAREA_CLASS}
        />
      </label>

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-brand text-white font-semibold text-sm disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm">
          Cancel
        </button>
      </div>
    </ModalShell>
  )
}

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
  bio: string
  preferences: string
  unreadMessageCount: number
}

export default function ProfileView({ firstName, lastName, email, bio, preferences, unreadMessageCount }: Props) {
  const [showEdit, setShowEdit] = useState(false)
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const posthog = usePostHog()
  const [showLogout, setShowLogout] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showBugReport, setShowBugReport] = useState(false)

  return (
    <main id="main-content" className="min-h-svh flex flex-col" style={{ backgroundColor: '#f5f7fa' }}>
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-36 max-w-sm mx-auto w-full safe-area-inset-bottom">

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Profile</h1>

        <DownloadAppCard href="/dashboard/profile/download-app" />

        {/* Profile card */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {initials || '?'}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-lg leading-tight">{fullName || email}</p>
              <p className="text-sm text-slate-400 flex items-center gap-1 mt-0.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                {email}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1">Bio</p>
            {bio ? (
              <p className="text-sm text-slate-600 whitespace-pre-line break-words">{bio}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">Write a short bio to help cleaners get to know you...</p>
            )}
          </div>

          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1">Cleaning preferences</p>
            {preferences ? (
              <p className="text-sm text-slate-600 whitespace-pre-line break-words">{preferences}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">Let your Tidy Pro know how you like things done...</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="w-full py-2.5 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Edit
          </button>
        </div>

        {/* Menu items */}
        {[
          { label: 'Manage Addresses', href: '/dashboard/profile/addresses' },
          { label: 'Pets', href: '/dashboard/profile/pets' },
          { label: 'Payment methods', href: '/dashboard/profile/payment-methods' },
          { label: 'Notifications', href: '/dashboard/profile/notifications' },
          { label: 'Accessibility', href: '/dashboard/profile/accessibility' },
          { label: 'Download app', href: '/dashboard/profile/download-app' },
          { label: 'Help & FAQs', href: '/faq' },
        ].map(item =>
          item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className="w-full bg-white rounded-2xl px-5 py-4 mb-3 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <span className="font-semibold text-slate-800 text-sm">{item.label}</span>
              <IconChevronRight />
            </Link>
          ) : (
            <button
              key={item.label}
              className="w-full bg-white rounded-2xl px-5 py-4 mb-3 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <span className="font-semibold text-slate-800 text-sm">{item.label}</span>
              <IconChevronRight />
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => setShowBugReport(true)}
          className="w-full bg-white rounded-2xl px-5 py-4 mb-3 shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <span className="font-semibold text-slate-800 text-sm">Report a bug</span>
          <IconChevronRight />
        </button>

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
      <nav aria-label="Main" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 safe-area-inset-bottom">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome />, label: 'Home', href: '/dashboard', active: false, badge: 0 },
            { icon: <IconCalendar />, label: 'Bookings', href: '/dashboard/bookings', active: false, badge: 0 },
            { icon: <IconMessage />, label: 'Messages', href: '/dashboard/messages', active: false, badge: unreadMessageCount },
            { icon: <IconUserActive />, label: 'Profile', href: '/dashboard/profile', active: true, badge: 0 },
          ].map(item => (
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

      {showEdit && <EditAboutSheet initialBio={bio} initialPreferences={preferences} onClose={() => setShowEdit(false)} />}

      {showBugReport && <BugReportSheet role="USER" onClose={() => setShowBugReport(false)} />}

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
