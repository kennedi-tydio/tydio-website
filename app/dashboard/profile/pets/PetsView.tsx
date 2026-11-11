'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from '@/app/components/NavigationSpinner'
import {
  MAX_PET_NAME_LENGTH,
  MAX_PET_NOTES_LENGTH,
  MAX_PET_TYPE_LENGTH,
  MAX_PETS,
  PET_TYPES,
  hasAnsweredPets,
} from '@/lib/customerPets'
import type { CustomerPetWithPhoto } from '@/lib/customerPetsData'
import { prepareImage } from '@/lib/prepareImage'
import { deletePetAction, discardPetPhotoAction, savePetAction, setNoPetsAction, uploadPetPhotoAction } from './actions'

type Mode = 'onboarding' | 'required' | 'settings'

type FormState = {
  id?: string
  name: string
  // One of PET_TYPES, or 'Other' with otherType filled in.
  typeChoice: string
  otherType: string
  notes: string
  photoPath: string | null
  photoUrl: string | null
  // A photo uploaded in this form that isn't saved on the pet yet.
  newPhotoPath: string | null
}

const PRESET_TYPES = PET_TYPES.filter((t) => t !== 'Other') as string[]

function emptyForm(): FormState {
  return { name: '', typeChoice: '', otherType: '', notes: '', photoPath: null, photoUrl: null, newPhotoPath: null }
}

function formForPet(p: CustomerPetWithPhoto): FormState {
  const preset = PRESET_TYPES.includes(p.petType)
  return {
    id: p.id,
    name: p.name ?? '',
    typeChoice: preset ? p.petType : 'Other',
    otherType: preset ? '' : p.petType,
    notes: p.notes ?? '',
    photoPath: p.photoPath,
    photoUrl: p.photoUrl,
    newPhotoPath: null,
  }
}

function PawIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5.5" cy="10" r="2.2" />
      <circle cx="9.5" cy="5.5" r="2.2" />
      <circle cx="14.5" cy="5.5" r="2.2" />
      <circle cx="18.5" cy="10" r="2.2" />
      <path d="M12 11c-3 0-6 3.6-6 6.3 0 1.8 1.4 2.7 3 2.7 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-.9 3-2.7C18 14.6 15 11 12 11z" />
    </svg>
  )
}

function PetAvatar({ url, label }: { url: string | null; label: string }) {
  if (url) {
    // Signed storage URLs, so a plain img rather than next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={label} className="w-12 h-12 rounded-full object-cover flex-shrink-0 bg-slate-100" />
  }
  return (
    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-400">
      <PawIcon />
    </div>
  )
}

export default function PetsView({
  initialPets,
  initialHasNoPets,
  mode,
  continueHref,
}: {
  initialPets: CustomerPetWithPhoto[]
  initialHasNoPets: boolean
  mode: Mode
  continueHref: string
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pets, setPets] = useState(initialPets)
  const [hasNoPets, setHasNoPets] = useState(initialHasNoPets)
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, startSaving] = useTransition()
  const [busy, startBusy] = useTransition()

  const answered = hasAnsweredPets(hasNoPets, pets.length)
  const guided = mode !== 'settings'

  function update(patch: Partial<FormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function closeForm() {
    if (form?.newPhotoPath) void discardPetPhotoAction(form.newPhotoPath)
    setForm(null)
    setFormError(null)
  }

  async function handlePhoto(files: FileList | null) {
    const file = files?.[0]
    if (!file || !form) return
    setUploading(true)
    setFormError(null)
    try {
      const body = new FormData()
      body.append('photo', await prepareImage(file))
      const result = await uploadPetPhotoAction(body)
      if ('error' in result) {
        setFormError(result.error)
        return
      }
      if (form.newPhotoPath) void discardPetPhotoAction(form.newPhotoPath)
      update({ photoPath: result.path, photoUrl: result.previewUrl, newPhotoPath: result.path })
    } catch {
      setFormError('That photo didn’t upload. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removePhoto() {
    if (form?.newPhotoPath) void discardPetPhotoAction(form.newPhotoPath)
    update({ photoPath: null, photoUrl: null, newPhotoPath: null })
  }

  function handleSave() {
    if (!form) return
    const petType = form.typeChoice === 'Other' ? form.otherType : form.typeChoice
    if (form.typeChoice === 'Other' && !form.otherType.trim()) {
      setFormError('Tell us what kind of pet this is.')
      return
    }
    startSaving(async () => {
      const result = await savePetAction({ id: form.id, name: form.name, petType, notes: form.notes, photoPath: form.photoPath })
      if ('error' in result) {
        setFormError(result.error)
        return
      }
      setPets(result.pets)
      setHasNoPets(false)
      setForm(null)
      setFormError(null)
    })
  }

  function handleDelete(pet: CustomerPetWithPhoto) {
    const label = pet.name || `this ${pet.petType.toLowerCase()}`
    if (!window.confirm(`Remove ${label}?`)) return
    startBusy(async () => {
      const result = await deletePetAction(pet.id)
      if ('error' in result) {
        setPageError(result.error)
        return
      }
      setPageError(null)
      setPets(result.pets)
    })
  }

  function handleNoPets(value: boolean) {
    startBusy(async () => {
      const result = await setNoPetsAction(value)
      if ('error' in result) {
        setPageError(result.error)
        return
      }
      setPageError(null)
      setHasNoPets(value)
    })
  }

  const typeIsOther = form?.typeChoice === 'Other'
  const canSave =
    !!form && !!form.typeChoice && (!typeIsOther || !!form.otherType.trim()) && !uploading && !saving

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-16 max-w-sm mx-auto w-full">
        {!guided && (
          <Link href="/dashboard/profile" className="flex items-center gap-1.5 mb-6 text-sm text-slate-500">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 12L6 8l4-4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Profile
          </Link>
        )}

        <h1 className="text-2xl font-bold text-slate-900 mb-2">{guided ? 'Any pets at home?' : 'Pets'}</h1>
        <p className="text-sm text-slate-500 mb-6">
          {mode === 'required'
            ? 'Before you book, let your Tidy Pro know about any pets in your home — or tell us you don’t have any.'
            : 'Your Tidy Pro will see this before each visit, so they know what to expect.'}
        </p>

        {pets.length > 0 && (
          <ul className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100 overflow-hidden mb-4">
            {pets.map((p) => (
              <li key={p.id} className="px-4 py-3.5 flex items-start gap-3">
                <PetAvatar url={p.photoUrl} label={p.name ? `Photo of ${p.name}` : `Photo of ${p.petType}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {p.name || p.petType}
                    {p.name && <span className="text-xs font-normal text-slate-400"> · {p.petType}</span>}
                  </p>
                  {p.notes && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line break-words">{p.notes}</p>}
                  <div className="flex gap-4 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null)
                        setForm(formForPet(p))
                      }}
                      className="text-xs font-semibold text-brand"
                      disabled={busy || !!form}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      className="text-xs font-semibold text-red-500"
                      disabled={busy || !!form}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {form ? (
          <section aria-labelledby="pet-form-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm mb-4">
            <h2 id="pet-form-title" className="font-semibold text-slate-900 mb-4">
              {form.id ? 'Edit pet' : 'Add a pet'}
            </h2>

            <div className="flex items-center gap-3 mb-4">
              <PetAvatar url={form.photoUrl} label="Pet photo" />
              <div className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-sm font-semibold text-brand"
                >
                  {uploading ? 'Uploading…' : form.photoPath ? 'Change photo' : 'Add a photo'}
                </button>
                {form.photoPath && !uploading && (
                  <button type="button" onClick={removePhoto} className="text-xs text-slate-400">
                    Remove photo
                  </button>
                )}
                <span className="text-xs text-slate-400">Optional</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Pet photo"
                onChange={(e) => void handlePhoto(e.target.files)}
              />
            </div>

            <label className="block mb-4">
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                Name <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input
                type="text"
                value={form.name}
                maxLength={MAX_PET_NAME_LENGTH}
                onChange={(e) => update({ name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand"
              />
            </label>

            <fieldset className="mb-4">
              <legend className="block text-xs font-semibold text-slate-700 mb-2">
                Type of pet <span className="text-red-500">*</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {PET_TYPES.map((t) => {
                  const selected = form.typeChoice === t
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => update({ typeChoice: t })}
                      className={`px-3 py-1.5 rounded-full text-sm border ${
                        selected ? 'bg-brand border-brand text-white' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
              {typeIsOther && (
                <input
                  type="text"
                  aria-label="What kind of pet?"
                  placeholder="What kind of pet?"
                  value={form.otherType}
                  maxLength={MAX_PET_TYPE_LENGTH}
                  onChange={(e) => update({ otherType: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand"
                />
              )}
            </fieldset>

            <label className="block mb-4">
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                Notes <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <textarea
                value={form.notes}
                maxLength={MAX_PET_NOTES_LENGTH}
                rows={3}
                placeholder="Temperament, where they’ll be, anything your Tidy Pro should avoid…"
                onChange={(e) => update({ notes: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-brand resize-none"
              />
            </label>

            {formError && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
                {formError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 py-3 rounded-xl bg-brand text-white font-semibold text-sm disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save pet'}
              </button>
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => {
              setFormError(null)
              setForm(emptyForm())
            }}
            disabled={busy || pets.length >= MAX_PETS}
            className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide mb-4 disabled:opacity-50"
            style={{ backgroundColor: '#1a2332' }}
          >
            {pets.length > 0 ? '+ Add another pet' : '+ Add a pet'}
          </button>
        )}

        {pets.length === 0 && !form && (
          <button
            type="button"
            onClick={() => handleNoPets(!hasNoPets)}
            disabled={busy}
            aria-pressed={hasNoPets}
            className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-4 text-left mb-4 ${
              hasNoPets ? 'border-brand bg-brand/5' : 'border-slate-200'
            }`}
          >
            <span
              className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border ${
                hasNoPets ? 'bg-brand border-brand' : 'border-slate-300'
              }`}
              aria-hidden="true"
            >
              {hasNoPets && (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1 4.5l3 3 6-6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-sm font-semibold text-slate-800">I don’t have any pets</span>
          </button>
        )}

        {pageError && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
            {pageError}
          </p>
        )}

        {guided && (
          <button
            type="button"
            onClick={() => router.push(continueHref)}
            disabled={!answered || !!form || busy}
            className="w-full py-4 rounded-2xl bg-brand text-white font-semibold text-base disabled:opacity-50"
          >
            {mode === 'required' ? 'Continue to booking' : 'Continue'}
          </button>
        )}
        {guided && !answered && (
          <p className="text-xs text-slate-400 text-center mt-2">Add a pet or choose “I don’t have any pets” to continue.</p>
        )}
      </div>
    </main>
  )
}
