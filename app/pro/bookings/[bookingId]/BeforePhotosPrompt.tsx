'use client'

import ModalShell from '@/app/components/ModalShell'

type Props = {
  working: boolean
  // Starts the job. wantsBeforePhotos says which answer they gave, so the
  // task list can lead with the before photo buttons.
  onContinue: (wantsBeforePhotos: boolean) => void
  onClose: () => void
}

// Asked when the Tidy Pro arrives and starts the job.
export default function BeforePhotosPrompt({ working, onContinue, onClose }: Props) {
  return (
    <ModalShell
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0"
      panelClassName="w-full max-w-sm bg-white rounded-2xl p-5"
      onClose={onClose}
      labelledBy="before-photos-title"
      closeOnBackdrop={!working}
    >
      <h2 id="before-photos-title" className="text-lg font-bold text-slate-900 mb-2">
        Take before photos?
      </h2>
      <p className="text-sm text-slate-600 mb-3">
        Before you start, you can snap a quick photo of each task area, like the bathtub before you clean it.
      </p>
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-3.5 py-3 mb-3">
        <p className="text-sm font-semibold text-slate-900">After photos are required</p>
        <p className="text-xs text-slate-500 mt-0.5">You&apos;ll take one for every task to mark it complete.</p>
      </div>
      <p className="text-sm text-slate-600 mb-5">
        With <span className="font-semibold">before and after</span> photos, you can show your work on your profile so
        future customers can see what you can do.
      </p>
      <button
        type="button"
        onClick={() => onContinue(true)}
        disabled={working}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-brand disabled:opacity-60 mb-2"
      >
        {working ? 'Starting…' : 'Yes, take before photos'}
      </button>
      <button
        type="button"
        onClick={() => onContinue(false)}
        disabled={working}
        className="w-full py-2.5 text-sm font-medium text-slate-500 disabled:opacity-60"
      >
        Skip before photos
      </button>
    </ModalShell>
  )
}
