'use client'

import { useEffect, useRef, useState } from 'react'
import { useIsStandalone } from './pushSubscription'

// How far the indicator has to come down (after resistance) before letting go reloads.
const THRESHOLD = 70
const MAX_PULL = 110
const RESISTANCE = 0.5

// A pull only starts from the very top: not inside something already scrolled
// down (message threads, sheets), on a map being dragged, or behind a dialog.
function canStartPull(target: EventTarget | null): boolean {
  if (window.scrollY > 0) return false
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return false
  for (let node = target instanceof Element ? target : null; node && node !== document.body; node = node.parentElement) {
    if (node.scrollTop > 0) return false
    if (node.matches('.gm-style, [data-no-pull-refresh]')) return false
  }
  return true
}

// Home screen apps have no pull-to-refresh of their own (a browser tab already
// does), so this adds one: pull down from the top and let go to reload, which
// picks up fresh data and any newly deployed version.
export default function PullToRefresh() {
  const standalone = useIsStandalone()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullRef = useRef(0)

  useEffect(() => {
    if (!standalone) return
    let start: { x: number; y: number } | null = null
    let pulling = false

    function setDistance(value: number) {
      pullRef.current = value
      setPull(value)
    }

    function onStart(e: TouchEvent) {
      start = e.touches.length === 1 && canStartPull(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
      pulling = false
    }

    function onMove(e: TouchEvent) {
      if (!start) return
      const dx = e.touches[0].clientX - start.x
      const dy = e.touches[0].clientY - start.y
      if (!pulling) {
        // Wait for a clear direction, so sideways swipes and sliders are left alone.
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return
        if (dy <= 0 || Math.abs(dx) > dy) {
          start = null
          return
        }
        pulling = true
      }
      e.preventDefault()
      setDistance(Math.min(MAX_PULL, Math.max(0, dy * RESISTANCE)))
    }

    function onEnd() {
      if (!pulling) {
        start = null
        return
      }
      start = null
      pulling = false
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true)
        window.location.reload()
      } else {
        setDistance(0)
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [standalone])

  if (!refreshing && pull === 0) return null

  const progress = Math.min(1, pull / THRESHOLD)
  const offset = refreshing ? THRESHOLD : pull

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex justify-center pointer-events-none"
      style={{ transform: `translateY(${offset - 44}px)`, transition: pull === 0 || refreshing ? 'transform 0.2s ease-out' : 'none' }}
    >
      <div className="w-10 h-10 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center">
        {refreshing ? (
          <>
            <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-brand animate-spin" aria-hidden="true" />
            <span role="status" className="sr-only">Refreshing</span>
          </>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ opacity: 0.4 + progress * 0.6, transform: `rotate(${progress >= 1 ? 180 : progress * 150}deg)`, transition: 'transform 0.15s' }}
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        )}
      </div>
    </div>
  )
}
