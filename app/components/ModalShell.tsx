'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'

// Shared wrapper for modals and bottom sheets. Keeps each caller's own layout
// classes, and adds what a dialog needs for keyboard and screen reader users:
// dialog semantics, focus moved in on open and back to the trigger on close,
// Tab kept inside, and Escape to close. Inner controls that use Escape
// themselves (e.g. StateSelect) call preventDefault so the modal stays open.
export default function ModalShell({
  onClose,
  labelledBy,
  label,
  className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center',
  panelClassName,
  closeOnBackdrop = true,
  children,
}: {
  onClose?: () => void
  labelledBy?: string
  label?: string
  className?: string
  panelClassName: string
  closeOnBackdrop?: boolean
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Read during the first render, before any autoFocus field inside takes focus.
  const openerRef = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const opener = openerRef.current as HTMLElement | null
    // Respect an autoFocus field inside; otherwise focus the dialog itself so
    // mobile keyboards don't pop up on open.
    if (!panel.contains(document.activeElement)) panel.focus()

    function onKey(e: KeyboardEvent) {
      if (!panel) return
      if (e.key === 'Escape' && onCloseRef.current && !e.defaultPrevented) {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  return (
    <div className={className}>
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`relative ${panelClassName}`}
        style={{ outline: 'none' }}
      >
        {children}
      </div>
    </div>
  )
}
