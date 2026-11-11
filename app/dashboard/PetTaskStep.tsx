'use client'

import { useEffect, useRef, useState } from 'react'
import type { Tier } from '@/lib/pricingRules'
import {
  ENCLOSURE_DEFAULT_SCOPE,
  LITTER_OPTIONS,
  LITTER_OPTION_LABEL,
  LITTER_OPTION_SCOPE,
  MAX_PET_TASK_PHOTOS,
  PET_PHOTO_REQUIREMENT,
  PET_TASK_PREP_NOTICE,
  PET_TYPE_SUGGESTIONS,
  formatEstimatedMinutes,
  petTypeFromName,
  type LitterOption,
  type PetTaskDetails,
  type PetTaskKind,
} from '@/lib/petTasks'
import { removeTaskPhotoAction, uploadTaskPhotoAction } from './actions'
import { prepareImage } from '@/lib/prepareImage'

export type PetPhoto = {
  id: string
  previewUrl: string
  // Set once the upload finishes.
  path: string | null
  status: 'uploading' | 'ready' | 'error'
  error?: string
}

// Everything the customer has entered on the pet step. Lives in AddTaskModal
// so going Back and forward keeps it.
export type PetDraft = {
  kind: PetTaskKind
  petType: string
  litterOption: LitterOption | null
  photos: PetPhoto[]
}

type CheckState =
  | { key: string; status: 'checking' }
  | { key: string; status: 'ok'; scope: string; minutes: number; tier: Tier }
  | { key: string; status: 'retake'; message: string; unusablePaths: string[] }
  | { key: string; status: 'invalid'; message: string }
  | { key: string; status: 'error'; message: string }

export function newPetDraft(kind: PetTaskKind, litterOption: LitterOption | null): PetDraft {
  return { kind, petType: '', litterOption, photos: [] }
}

// Photos that made it to storage, in the order they were added.
export function readyPhotoPaths(draft: PetDraft): string[] {
  return draft.photos.flatMap((p) => (p.status === 'ready' && p.path ? [p.path] : []))
}

// Removes uploads that never made it onto a saved task.
export function discardPetDraftPhotos(draft: PetDraft | null) {
  if (!draft) return
  for (const p of draft.photos) {
    URL.revokeObjectURL(p.previewUrl)
    if (p.path) void removeTaskPhotoAction(p.path)
  }
}

type Props = {
  name: string
  notes: string
  draft: PetDraft
  setDraft: (update: (prev: PetDraft) => PetDraft) => void
  taskInputs: React.ReactNode
  onCancel: () => void
  onAdd: (details: PetTaskDetails, tier: Tier, estimatedMinutes: number) => void
}

export default function PetTaskStep({ name, notes, draft, setDraft, taskInputs, onCancel, onAdd }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [check, setCheck] = useState<CheckState | null>(null)
  // Set when "Upload a new photo" opens the picker: the photos the check
  // couldn't use are swapped out for what the customer picks.
  const replacingRef = useRef<string[] | null>(null)
  const latestKeyRef = useRef('')

  const { kind } = draft
  const petTypeFromDescription = kind === 'enclosure' ? petTypeFromName(name) : null
  const petType = petTypeFromDescription ?? draft.petType.trim()
  const paths = readyPhotoPaths(draft)
  const uploading = draft.photos.some((p) => p.status === 'uploading')
  const optionsDone = kind === 'litterBox' ? draft.litterOption != null : petType !== ''

  // Anything that changes what the photos are judged against. When it
  // changes, the last check no longer applies and runs again.
  const checkKey = JSON.stringify({
    kind,
    name: name.trim(),
    petType: kind === 'enclosure' ? petType : null,
    litterOption: kind === 'litterBox' ? draft.litterOption : null,
    notes: notes.trim(),
    paths,
  })
  useEffect(() => {
    latestKeyRef.current = checkKey
  }, [checkKey])
  const canCheck = paths.length > 0 && !uploading && optionsDone
  const current = check && check.key === checkKey ? check : null
  const unusable = current?.status === 'retake' ? current.unusablePaths : []

  async function runCheck(key: string) {
    setCheck({ key, status: 'checking' })
    let next: CheckState
    try {
      const res = await fetch('/api/check-pet-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          petType: kind === 'enclosure' ? petType : null,
          litterOption: kind === 'litterBox' ? draft.litterOption : null,
          notes,
          photos: paths,
        }),
      })
      if (res.status === 429) {
        next = { key, status: 'error', message: 'You’ve checked a lot of photos in the last hour. Please try again a little later.' }
      } else if (!res.ok) {
        throw new Error(`check-pet-task returned ${res.status}`)
      } else {
        const data = (await res.json()) as
          | { status: 'ok'; scope: string; estimated_minutes: number; tier: Tier }
          | { status: 'retake'; message: string; unusablePhotos: number[] }
          | { status: 'invalid'; reason: string }
        if (data.status === 'ok') {
          next = { key, status: 'ok', scope: data.scope, minutes: data.estimated_minutes, tier: data.tier }
        } else if (data.status === 'retake') {
          next = {
            key,
            status: 'retake',
            message: data.message,
            unusablePaths: data.unusablePhotos.map((i) => paths[i]).filter(Boolean),
          }
        } else {
          next = { key, status: 'invalid', message: data.reason }
        }
      }
    } catch {
      const offline = typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine
      next = {
        key,
        status: 'error',
        message: offline
          ? 'No internet connection. Check your connection, then check your photo again.'
          : 'We couldn’t check your photo just now. Your photo is saved, so you can try again.',
      }
    }
    // Ignore an answer for photos or options that have since changed.
    if (latestKeyRef.current === key) setCheck(next)
  }

  // Check automatically once there's something to check, and again whenever
  // a photo, option or the instructions change (after typing settles).
  useEffect(() => {
    if (!canCheck || check?.key === checkKey) return
    const timer = setTimeout(() => void runCheck(checkKey), 900)
    return () => clearTimeout(timer)
    // runCheck reads the same values checkKey is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCheck, checkKey, check?.key])

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const replacing = replacingRef.current ?? []
    replacingRef.current = null

    // Keep every usable photo; only the ones the check flagged are swapped out.
    const kept = draft.photos.filter((p) => !(p.path && replacing.includes(p.path)))
    const room = MAX_PET_TASK_PHOTOS - kept.length
    const picked = Array.from(files).slice(0, Math.max(0, room))
    if (picked.length === 0) return

    for (const p of draft.photos) {
      if (p.path && replacing.includes(p.path)) {
        URL.revokeObjectURL(p.previewUrl)
        void removeTaskPhotoAction(p.path)
      }
    }

    const added: PetPhoto[] = picked.map((file) => ({
      id: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
      path: null,
      status: 'uploading',
    }))
    setDraft((prev) => ({
      ...prev,
      photos: [...prev.photos.filter((p) => !(p.path && replacing.includes(p.path))), ...added],
    }))

    await Promise.all(
      picked.map(async (file, i) => {
        const id = added[i].id
        let patch: Partial<PetPhoto>
        try {
          const prepared = await prepareImage(file)
          const form = new FormData()
          form.append('photo', prepared)
          const result = await uploadTaskPhotoAction(form)
          patch = 'path' in result ? { status: 'ready', path: result.path } : { status: 'error', error: result.error }
        } catch {
          patch = { status: 'error', error: 'Upload failed. Check your connection and try again.' }
        }
        setDraft((prev) => ({ ...prev, photos: prev.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
      })
    )
  }

  function removePhoto(photo: PetPhoto) {
    URL.revokeObjectURL(photo.previewUrl)
    if (photo.path) void removeTaskPhotoAction(photo.path)
    setDraft((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== photo.id) }))
  }

  function openPicker(replace: string[] | null) {
    replacingRef.current = replace
    fileInputRef.current?.click()
  }

  function handleAdd() {
    if (current?.status !== 'ok') return
    onAdd(
      {
        kind,
        petType: kind === 'enclosure' ? petType : null,
        litterOption: kind === 'litterBox' ? draft.litterOption : null,
        scope: current.scope,
        photos: paths,
      },
      current.tier,
      current.minutes
    )
  }

  const canAddMore = draft.photos.length < MAX_PET_TASK_PHOTOS
  const defaultScope = kind === 'litterBox' ? (draft.litterOption ? LITTER_OPTION_SCOPE[draft.litterOption] : null) : ENCLOSURE_DEFAULT_SCOPE

  return (
    <>
      {taskInputs}

      {/* Enclosure: what pet, only when the description didn't say */}
      {kind === 'enclosure' && !petTypeFromDescription && (
        <div className="mb-5">
          <label htmlFor="pet-type" className="block text-sm font-semibold text-slate-900 mb-2">
            What pet lives in it?<span className="text-brand">*</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {PET_TYPE_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={draft.petType === s}
                onClick={() => setDraft((prev) => ({ ...prev, petType: s }))}
                className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${
                  draft.petType === s ? 'border-brand bg-brand text-white' : 'border-slate-200 text-slate-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            id="pet-type"
            type="text"
            maxLength={60}
            placeholder="Or type it (e.g. ferret)"
            value={draft.petType}
            onChange={(e) => setDraft((prev) => ({ ...prev, petType: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand"
          />
        </div>
      )}

      {/* Litter box: which kind of clean */}
      {kind === 'litterBox' && (
        <div className="mb-5">
          <p id="litter-option-label" className="text-sm font-semibold text-slate-900 mb-3">
            What should we do?<span className="text-brand">*</span>
          </p>
          <div role="radiogroup" aria-labelledby="litter-option-label" className="flex flex-col gap-3">
            {LITTER_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={draft.litterOption === opt}
                onClick={() => setDraft((prev) => ({ ...prev, litterOption: opt }))}
                className="flex items-start gap-3 text-left"
              >
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    draft.litterOption === opt ? 'border-brand' : 'border-slate-300'
                  }`}
                >
                  {draft.litterOption === opt && <div className="w-2.5 h-2.5 rounded-full bg-brand" />}
                </div>
                <span>
                  <span className="block text-sm font-medium text-slate-800">{LITTER_OPTION_LABEL[opt]}</span>
                  <span className="block text-xs text-slate-500 leading-relaxed">{LITTER_OPTION_SCOPE[opt]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === 'enclosure' && defaultScope && (
        <div className="mb-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">What&apos;s included</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            {defaultScope} Want less done? Say so in your instructions.
          </p>
        </div>
      )}

      {/* Photos */}
      <div className="mb-5">
        <p className="text-sm font-semibold text-slate-900 mb-1">
          Photos<span className="text-brand">*</span>
        </p>
        <p className="text-xs text-slate-500 leading-relaxed mb-3">{PET_PHOTO_REQUIREMENT[kind]}</p>

        <div className="grid grid-cols-3 gap-2">
          {draft.photos.map((photo, i) => {
            const flagged = photo.path != null && unusable.includes(photo.path)
            return (
              <div
                key={photo.id}
                className={`relative aspect-square rounded-xl overflow-hidden bg-slate-100 border-2 ${
                  flagged || photo.status === 'error' ? 'border-red-400' : 'border-transparent'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.previewUrl} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                {photo.status === 'uploading' && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-[11px] font-semibold text-slate-600">
                    Uploading…
                  </div>
                )}
                {(flagged || photo.status === 'error') && (
                  <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-1 py-0.5 text-[10px] font-semibold text-white text-center">
                    {photo.status === 'error' ? 'Didn’t upload' : 'Can’t use'}
                  </div>
                )}
                {photo.status !== 'uploading' && (
                  <button
                    type="button"
                    onClick={() => removePhoto(photo)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-1 right-1 w-7 h-7 rounded-full bg-slate-900/70 text-white flex items-center justify-center"
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
          {canAddMore && (
            <button
              type="button"
              onClick={() => openPicker(null)}
              className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-500"
            >
              <span className="text-2xl leading-none">+</span>
              <span className="text-[11px] font-semibold">{draft.photos.length === 0 ? 'Add photo' : 'Add more'}</span>
            </button>
          )}
        </div>
        {draft.photos.some((p) => p.status === 'error') && (
          <p className="text-xs text-red-600 mt-2">
            {draft.photos.find((p) => p.status === 'error')?.error} Tap × on that photo, then add it again.
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Check result */}
      <div aria-live="polite">
        {current?.status === 'checking' && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 mb-4">
            Checking your photos…
          </p>
        )}
        {current?.status === 'retake' && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 mb-4">
            <p className="text-sm font-semibold text-amber-900 mb-1">Upload a new photo</p>
            <p className="text-xs text-amber-900 leading-relaxed mb-3">{current.message}</p>
            <button
              type="button"
              onClick={() => openPicker(current.unusablePaths)}
              className="w-full py-2.5 rounded-xl bg-white border border-amber-300 text-sm font-semibold text-amber-900"
            >
              Upload a new photo
            </button>
          </div>
        )}
        {current?.status === 'invalid' && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4 leading-relaxed">
            {current.message}
          </p>
        )}
        {current?.status === 'error' && (
          <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 mb-4">
            <p className="text-xs text-red-700 leading-relaxed mb-2">{current.message}</p>
            <button
              type="button"
              onClick={() => void runCheck(checkKey)}
              className="w-full py-2.5 rounded-xl bg-white border border-red-200 text-sm font-semibold text-red-700"
            >
              Check again
            </button>
          </div>
        )}
        {current?.status === 'ok' && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 mb-4">
            <p className="text-sm font-semibold text-emerald-900">
              Photos look good · {formatEstimatedMinutes(current.minutes)}
            </p>
            <p className="text-xs text-emerald-900 leading-relaxed mt-1">{current.scope}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-slate-50 px-3 py-3 mb-5">
        <p className="text-xs font-semibold text-slate-700 mb-0.5">Before your Tidy Pro arrives</p>
        <p className="text-xs text-slate-500 leading-relaxed">{PET_TASK_PREP_NOTICE[kind]}</p>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold text-slate-600">
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={current?.status !== 'ok'}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: '#1a2332' }}
        >
          {current?.status === 'checking' ? 'Checking…' : 'Add task'}
        </button>
      </div>
    </>
  )
}
