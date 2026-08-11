'use client'

import { useState } from 'react'
import Link from 'next/link'
import { logoutAction, deleteAccountAction } from '../actions'
import { updateBioAction } from './actions'

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
}

function IconUserActive() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38C7CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-2xl">
        <p className="font-bold text-slate-900 text-lg mb-1">{title}</p>
        <p className="text-sm text-slate-500 mb-6">{body}</p>
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
      </div>
    </div>
  )
}

type Props = {
  firstName: string
  lastName: string
  email: string
  bio: string | null
}

export default function ProfileView({ firstName, lastName, email, bio: initialBio }: Props) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const [showLogout, setShowLogout] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [bio, setBio] = useState(initialBio)
  const [editingBio, setEditingBio] = useState(false)
  const [bioDraft, setBioDraft] = useState(initialBio ?? '')
  const [savingBio, setSavingBio] = useState(false)

  function startEditingBio() {
    setBioDraft(bio ?? '')
    setEditingBio(true)
  }

  async function handleSaveBio() {
    setSavingBio(true)
    const result = await updateBioAction(bioDraft)
    setSavingBio(false)
    if (!('error' in result)) {
      setBio(result.bio)
      setEditingBio(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5f7fa' }}>
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-36 max-w-sm mx-auto w-full">

        <h1 className="text-3xl font-bold text-slate-900 mb-6">Profile</h1>

        {/* Profile card */}
        <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
              style={{ backgroundColor: '#38C7CA' }}
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
            {editingBio ? (
              <textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                placeholder="Write a short bio to help customers get to know you..."
                rows={3}
                autoFocus
                className="w-full px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-[#38C7CA] resize-none"
              />
            ) : bio ? (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{bio}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">Write a short bio to help customers get to know you...</p>
            )}
          </div>

          {editingBio ? (
            <div className="flex gap-3">
              <button
                onClick={() => setEditingBio(false)}
                disabled={savingBio}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBio}
                disabled={savingBio}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: '#1a2332' }}
              >
                {savingBio ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              onClick={startEditingBio}
              className="w-full py-2.5 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Edit
            </button>
          )}
        </div>

        {/* Menu items */}
        {[
          { label: 'Manage Address', href: '/pro/profile/address' },
          { label: 'Payout methods', href: null },
          { label: 'Availability', href: '/pro/profile/availability' },
          { label: 'Allergies', href: null },
        ].map((item) =>
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
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-100">
        <div className="flex justify-around items-center py-2 max-w-sm mx-auto px-2">
          {[
            { icon: <IconHome />, label: 'Home', href: '/pro/dashboard', active: false },
            { icon: <IconCalendar />, label: 'Bookings', href: '/pro/dashboard', active: false },
            { icon: <IconMessage />, label: 'Messages', href: '/pro/dashboard', active: false },
            { icon: <IconUserActive />, label: 'Profile', href: '/pro/profile', active: true },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="flex flex-col items-center gap-0.5 px-3 py-1 relative">
              {item.icon}
              <span className={`text-[10px] font-medium ${item.active ? 'text-[#38C7CA]' : 'text-slate-400'}`}>
                {item.label}
              </span>
              {item.active && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#38C7CA]" />
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
          onConfirm={async () => { await logoutAction() }}
        />
      )}

      {/* Delete account confirmation */}
      {showDelete && (
        <ConfirmSheet
          title="Delete your account?"
          body="This permanently deletes your account and all data. This cannot be undone."
          confirmLabel="Delete Account"
          onCancel={() => setShowDelete(false)}
          onConfirm={async () => { await deleteAccountAction() }}
        />
      )}
    </div>
  )
}
