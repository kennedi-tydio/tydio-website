'use client'

import { useState } from 'react'
import {
  describeDevice,
  getInstallGuide,
  promptInstall,
  useCanPromptInstall,
  useDevice,
  type Device,
  type Platform,
} from './installGuide'

type Props = {
  titleId: string
  // added is true for "I've added it" (or an accepted install prompt), false for Skip.
  onDone: (added: boolean) => void
  skipLabel?: string
}

// Step-by-step "add Tydio to your home screen" instructions. Uses the detected
// phone and browser when it can, and lets the person pick their device when
// it can't (a computer) or when the detection is wrong.
export default function AddToHomeScreenGuide({ titleId, onDone, skipLabel = 'Skip' }: Props) {
  const detected = useDevice()
  const canPrompt = useCanPromptInstall()
  const [chosen, setChosen] = useState<Platform | null>(null)
  const [installing, setInstalling] = useState(false)

  // A manual pick assumes the platform's default browser and the latest OS.
  const device: Device | null = chosen
    ? chosen === detected?.platform
      ? detected
      : { platform: chosen, iosVersion: null, iPad: false, browser: chosen === 'ios' ? 'safari' : 'chrome' }
    : detected?.platform
      ? detected
      : null

  async function handleInstall() {
    setInstalling(true)
    const accepted = await promptInstall()
    setInstalling(false)
    if (accepted) onDone(true)
  }

  const guide = device ? getInstallGuide(device) : null

  return (
    <>
      <h2 id={titleId} className="text-lg font-bold text-slate-900 mb-1">Add Tydio to your home screen</h2>
      <p className="text-sm text-slate-500 mb-4">
        Open Tydio in one tap like an app, and get push notifications about your bookings.
      </p>

      {!device ? (
        <>
          <p className="text-sm font-semibold text-slate-900 mb-2">Which phone are you using?</p>
          <div className="flex gap-3 mb-3">
            <PlatformButton label="iPhone or iPad" onClick={() => setChosen('ios')} />
            <PlatformButton label="Android" onClick={() => setChosen('android')} />
          </div>
          {detected && (
            <p className="text-xs text-slate-400 mb-4">Open Tydio on your phone and follow the steps there.</p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-semibold text-slate-500">{describeDevice(device)}</span>
            <button
              type="button"
              onClick={() => setChosen(device.platform === 'ios' ? 'android' : 'ios')}
              className="text-sky-600 underline underline-offset-2"
            >
              Using {device.platform === 'ios' ? 'Android' : 'an iPhone'}?
            </button>
          </div>

          {canPrompt && device.platform === detected?.platform && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 mb-3"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {installing ? 'Opening…' : 'Install Tydio'}
            </button>
          )}

          {guide && (
            <>
              {guide.intro && <p className="text-sm text-slate-700 mb-2">{guide.intro}</p>}
              <ol className="space-y-2 mb-3">
                {guide.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-700">
                    <span
                      aria-hidden="true"
                      className="flex-none w-6 h-6 rounded-full text-xs font-bold text-white flex items-center justify-center"
                      style={{ backgroundColor: 'var(--color-brand)' }}
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              {guide.note && <p className="text-xs text-slate-400 mb-2">{guide.note}</p>}
              <p className="text-xs text-slate-400 mb-4">
                Then open Tydio from your home screen. You may need to log in once more the first time.
              </p>
            </>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => onDone(true)}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        I&apos;ve added it to my home screen
      </button>
      <button
        type="button"
        onClick={() => onDone(false)}
        className="block mx-auto mt-3 text-sm text-slate-500 underline underline-offset-2"
      >
        {skipLabel}
      </button>
    </>
  )
}

function PlatformButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700"
    >
      {label}
    </button>
  )
}
