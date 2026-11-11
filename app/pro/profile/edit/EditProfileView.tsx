'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import { updateProfileAction, updateProfilePhotoAction } from '../actions'

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

const FIELD_CLASS = 'block rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-brand'
const LABEL_CLASS = 'block text-xs text-slate-400 mb-0.5'
const INPUT_CLASS = 'w-full text-sm text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none'

type Props = {
  firstName: string
  lastName: string
  bio: string
  phone: string
  location: string
  photoUrl: string | null
  allergies: string[]
  usesOrganicProducts: boolean
  unreadMessageCount: number
}

export default function EditProfileView({ location, unreadMessageCount, photoUrl: initialPhotoUrl, ...initial }: Props) {
  const router = useRouter()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [bio, setBio] = useState(initial.bio)
  const [phone, setPhone] = useState(initial.phone)
  const [allergies, setAllergies] = useState(initial.allergies)
  const [usesOrganicProducts, setUsesOrganicProducts] = useState(initial.usesOrganicProducts)
  const [allergyDraft, setAllergyDraft] = useState('')
  const [editingAllergies, setEditingAllergies] = useState(false)
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()

  // Coming back with the browser's back button (say from the address page,
  // after saving on the way there) shows this page as it was first loaded.
  // Refreshing pulls what's saved; the page keys this view on it, so the form
  // starts over with the saved bio rather than the old one.
  useEffect(() => {
    router.refresh()
  }, [router])

  function withDraftAllergy(list: string[]): string[] {
    const draft = allergyDraft.trim()
    if (!draft || list.some((a) => a.toLowerCase() === draft.toLowerCase())) return list
    return [...list, draft]
  }

  function handleAddAllergy() {
    setAllergies(withDraftAllergy(allergies))
    setAllergyDraft('')
    setJustSaved(false)
  }

  async function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingPhoto(true)
    setError(null)
    const formData = new FormData()
    formData.set('photo', file)
    const result = await updateProfilePhotoAction(formData)
    setUploadingPhoto(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setPhotoUrl(result.photoUrl)
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    setError(null)
    setJustSaved(false)
    // A typed allergy that wasn't explicitly added still counts — otherwise
    // Save would quietly drop what's sitting in the box.
    const nextAllergies = withDraftAllergy(allergies)
    const result = await updateProfileAction({ firstName, lastName, bio, phone, allergies: nextAllergies, usesOrganicProducts })
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return false
    }
    setAllergies(nextAllergies)
    setAllergyDraft('')
    setEditingAllergies(false)
    return true
  }

  async function handleSave() {
    if (await save()) setJustSaved(true)
  }

  // The preview renders what's saved, so save first — otherwise edits made on
  // this page wouldn't show up in it and would be lost on the way back.
  async function handleViewAsCustomer() {
    if (await save()) router.push('/pro/profile/preview')
  }

  // Same for the address page, which sends them back here once an address is saved.
  async function handleEditLocation() {
    if (await save()) router.push('/pro/profile/address?returnTo=edit')
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-44 max-w-sm mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/pro/profile"
            aria-label="Back"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={handleViewAsCustomer}
            disabled={saving}
            className="text-sm font-semibold disabled:opacity-50"
            style={{ color: 'var(--color-brand)' }}
          >
            View as customer
          </button>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-4">Your Profile</h1>

        <div className="flex flex-col items-center mb-5">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="Your profile" className="w-20 h-20 rounded-full object-cover mb-2" />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-2"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {initials || '?'}
            </div>
          )}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="px-4 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-500 disabled:opacity-50"
          >
            {uploadingPhoto ? 'Uploading…' : 'Edit photo'}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePhotoChosen}
            className="hidden"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>First name</span>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className={FIELD_CLASS}>
            <span className={LABEL_CLASS}>Last name</span>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={INPUT_CLASS} />
          </label>
        </div>

        <label className={`${FIELD_CLASS} mb-3`}>
          <span className={LABEL_CLASS}>Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Write a short bio to help customers get to know you..."
            rows={3}
            className={`${INPUT_CLASS} resize-none`}
          />
        </label>

        <label className={`${FIELD_CLASS} mb-3 flex items-center justify-between gap-3 cursor-pointer`}>
          <span>
            <span className="block text-sm text-slate-800">I use organic cleaning products</span>
            <span className="block text-xs text-slate-400 mt-0.5">Shown to customers on your profile</span>
          </span>
          <input
            type="checkbox"
            checked={usesOrganicProducts}
            onChange={(e) => {
              setUsesOrganicProducts(e.target.checked)
              setJustSaved(false)
            }}
            className="peer sr-only"
          />
          {/* Drawn box instead of the native one, whose checkmark colour the
              browser picks (dark on our teal); the real input stays for
              keyboard, screen readers and label clicks. */}
          <span
            aria-hidden="true"
            className="w-5 h-5 shrink-0 rounded-md border-2 border-slate-300 flex items-center justify-center transition-colors peer-checked:bg-brand peer-checked:border-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.2l2.3 2.3 4.7-4.9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </label>

        {/* City and state come from the Tidy Pro's address, which also sets the
            coordinates used for matching, so it's changed there rather than
            as free text here. */}
        <button
          type="button"
          onClick={handleEditLocation}
          disabled={saving}
          className={`${FIELD_CLASS} mb-3 w-full text-left disabled:opacity-50`}
        >
          <span className={LABEL_CLASS}>Location</span>
          <span className={`block text-sm ${location ? 'text-slate-800' : 'text-slate-400'}`}>
            {location || 'Add your address'}
          </span>
        </button>

        <label className={`${FIELD_CLASS} mb-6`}>
          <span className={LABEL_CLASS}>Phone number</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT_CLASS} />
        </label>

        <h2 className="text-sm font-bold text-slate-900 mb-2">Special Needs</h2>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-800">Allergies</p>
            <button
              type="button"
              onClick={() => setEditingAllergies((v) => !v)}
              className="px-3 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-500"
            >
              {editingAllergies ? 'Done' : 'Edit'}
            </button>
          </div>

          {!editingAllergies && (
            <p className={`text-sm mt-1 ${allergies.length > 0 ? 'text-slate-600' : 'text-slate-400'}`}>
              {allergies.length > 0 ? allergies.join(', ') : 'None added'}
            </p>
          )}

          {editingAllergies && (
            <div className="mt-3">
              {allergies.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {allergies.map((allergy) => (
                    <span key={allergy} className="flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-slate-100 text-xs text-slate-700">
                      {allergy}
                      <button
                        type="button"
                        aria-label={`Remove ${allergy}`}
                        onClick={() => {
                          setAllergies((prev) => prev.filter((a) => a !== allergy))
                          setJustSaved(false)
                        }}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4l8 8M4 12L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={allergyDraft}
                  onChange={(e) => setAllergyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddAllergy()
                    }
                  }}
                  placeholder="e.g. Dogs"
                  aria-label="Add an allergy"
                  autoFocus
                  className="flex-1 min-w-0 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={handleAddAllergy}
                  disabled={!allergyDraft.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-brand)' }}
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-xs text-red-600 mt-3">{error}</p>}
        {justSaved && <p className="text-xs font-semibold text-green-600 mt-3">Your profile has been saved.</p>}
      </div>

      <div className="fixed bottom-20 inset-x-0 pointer-events-none">
        <div className="max-w-sm mx-auto px-5 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="pointer-events-auto px-12 py-3.5 rounded-xl text-white font-semibold text-sm shadow-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

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
    </main>
  )
}
