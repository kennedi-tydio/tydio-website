'use client'

import { useId, useSyncExternalStore } from 'react'
import ToggleSwitch from './form/ToggleSwitch'
import { CONTRAST_CHANGE_EVENT as CHANGE_EVENT, CONTRAST_STORAGE_KEY as STORAGE_KEY } from './contrast'

function isHighContrast() {
  return document.documentElement.dataset.contrast === 'high'
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function setHighContrast(on: boolean) {
  if (on) document.documentElement.dataset.contrast = 'high'
  else delete document.documentElement.dataset.contrast
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'high' : 'default')
  } catch {
    // Storage blocked (private mode etc.) — the setting just won't persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useHighContrast() {
  return useSyncExternalStore(subscribe, isHighContrast, () => false)
}

// `variant="row"` matches the settings rows in the profile screens;
// `variant="inline"` is the compact footer version.
export default function HighContrastToggle({ variant = 'row' }: { variant?: 'row' | 'inline' }) {
  const on = useHighContrast()
  const labelId = useId()
  const descId = useId()

  if (variant === 'inline') {
    return (
      <span className="inline-flex items-center gap-2">
        <span id={labelId} className="text-slate-600">High contrast</span>
        <ToggleSwitch on={on} onClick={() => setHighContrast(!on)} labelledBy={labelId} />
      </span>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p id={labelId} className="font-semibold text-slate-900 text-sm">High contrast</p>
        <p id={descId} className="text-xs text-slate-600 mt-0.5">
          Darker colors for text and buttons so they are easier to read
        </p>
      </div>
      <ToggleSwitch on={on} onClick={() => setHighContrast(!on)} labelledBy={labelId} describedBy={descId} />
    </div>
  )
}
