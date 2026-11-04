'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from '@/app/components/NavigationSpinner'
import { uploadInsuranceDocumentAction } from './actions'

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M10 12L6 8l4-4" stroke="#1a2332" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCheckCircle() {
  return (
    <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--color-brand)' }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </div>
  )
}

type Props = {
  status: string | null
  denialReason: string | null
  nextInsuranceUrl: string
}

export default function InsuranceView({ status, denialReason, nextInsuranceUrl }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showUpload, setShowUpload] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedStatus, setSubmittedStatus] = useState(status)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleUploadClick() {
    setError(null)
    setShowUpload(true)
  }

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    setSelectedFile(e.target.files?.[0] ?? null)
  }

  function handleUpload() {
    if (!selectedFile) return

    const formData = new FormData()
    formData.append('document', selectedFile)

    startTransition(async () => {
      const result = await uploadInsuranceDocumentAction(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setError(null)
        setSubmittedStatus('pending')
        setShowUpload(false)
      }
    })
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex flex-col px-6 pt-6 pb-10">
      <div className="max-w-sm mx-auto w-full flex-1 flex flex-col">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 -ml-2 mb-4"
        >
          <IconBack />
        </button>

        {submittedStatus === 'approved' ? (
          <>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight mb-3">You&apos;re Insured</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Your proof of insurance has been approved. The &quot;Insured Cleaner&quot; badge now shows on your public profile.
            </p>
            <div className="rounded-2xl border border-slate-100 px-4 py-4 flex items-center gap-3 shadow-sm">
              <IconCheckCircle />
              <p className="text-sm font-bold text-slate-900">Insured Cleaner</p>
            </div>
          </>
        ) : submittedStatus === 'pending' ? (
          <>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight mb-3">Under Review</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              We&apos;re reviewing your proof of insurance now. We&apos;ll notify you by email and text once it&apos;s approved.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight mb-3">
              Optional Insurance
              <br />
              for Cleaners
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Protect yourself on the job and gain customer trust
            </p>

            {submittedStatus === 'expired' && (
              <div className="rounded-2xl px-4 py-4 mb-6" style={{ backgroundColor: '#fef2f2' }}>
                <p className="text-sm font-bold mb-1" style={{ color: '#ef4444' }}>
                  Your insurance has expired
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Please upload your updated proof of insurance below to get your Insured Cleaner badge back.
                </p>
              </div>
            )}

            {submittedStatus === 'denied' && (
              <div className="rounded-2xl px-4 py-4 mb-6" style={{ backgroundColor: '#fef2f2' }}>
                <p className="text-sm font-bold mb-1" style={{ color: '#ef4444' }}>
                  Your proof of insurance wasn&apos;t approved
                </p>
                {denialReason && <p className="text-sm text-slate-600 leading-relaxed">{denialReason}</p>}
                <p className="text-sm text-slate-600 leading-relaxed mt-2">
                  Please upload another document below, or get covered through Next Insurance.
                </p>
              </div>
            )}

            <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
              Why get insurance?
            </p>
            <ul className="text-sm text-slate-700 leading-relaxed list-disc pl-5 space-y-1 mb-6">
              <li>Covers accidental damage in clients&apos; homes</li>
              <li>Protects you from liability if someone is injured</li>
              <li>Helps you look more professional</li>
              <li>Required by some clients to accept jobs</li>
            </ul>

            <p className="text-sm font-bold mb-2" style={{ color: 'var(--color-brand)' }}>
              How it works
            </p>
            <ol className="text-sm text-slate-700 leading-relaxed list-decimal pl-5 space-y-1 mb-8">
              <li>Tap below to visit our trusted partner, Next Insurance</li>
              <li>Get a quote in less than 5 minutes</li>
              <li>Choose a monthly or annual plan that fits your budget</li>
              <li>Upload your proof of insurance to unlock &quot;Insured Cleaner&quot; badge</li>
            </ol>

            <a
              href={nextInsuranceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-2xl text-white font-semibold text-base tracking-wide text-center block"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              Get covered now with Next Insurance
            </a>
            <p className="text-center text-xs text-slate-400 mt-3 mb-6">This link opens in an external browser</p>

            <p className="text-sm font-bold text-slate-900 mb-2">Already have insurance?</p>
            {showUpload ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={handleFileChosen}
                  disabled={isPending}
                  aria-label="Proof of insurance file"
                  className="sr-only"
                />
                <div className="flex items-center gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isPending}
                    className="flex-shrink-0 px-4 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
                    style={{ backgroundColor: 'var(--color-brand)' }}
                  >
                    Choose File
                  </button>
                  <span className={`text-sm truncate min-w-0 ${selectedFile ? 'text-slate-700' : 'text-slate-400'}`}>
                    {selectedFile?.name ?? 'No file chosen'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!selectedFile || isPending}
                  className={`w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 ${
                    selectedFile ? 'text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                  style={selectedFile ? { backgroundColor: 'var(--color-brand)' } : undefined}
                >
                  {isPending ? 'Uploading…' : 'Upload insurance'}
                </button>
                {error && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{error}</p>}
              </>
            ) : (
              <button
                type="button"
                onClick={handleUploadClick}
                className="w-full py-3.5 rounded-2xl bg-slate-100 text-slate-700 font-semibold text-sm"
              >
                Upload Proof of Insurance
              </button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
