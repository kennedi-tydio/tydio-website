'use client'

import { useEffect, useRef, useState } from 'react'
import ModalShell from '@/app/components/ModalShell'

import type { UnseenTips } from '@/lib/unseenTips'

// Shown when a Tidy Pro opens or refreshes the app with tips they haven't seen yet.
// The server sends what's unseen on a full load; when the app comes back to the
// foreground (reopened from the home screen or tab switched back) it asks again, since
// that doesn't reload the page. Closing it marks those tips seen, so it shows once per tip.
export default function TipCelebrationModal({
  initial,
  loadUnseen,
  onSeen,
}: {
  initial: UnseenTips
  loadUnseen: () => Promise<UnseenTips>
  onSeen: (bookingIds: string[]) => Promise<void>
}) {
  const [tips, setTips] = useState<UnseenTips>(initial)

  useEffect(() => {
    async function check() {
      if (document.visibilityState !== 'visible') return
      try {
        const latest = await loadUnseen()
        if (latest.bookingIds.length > 0) setTips(latest)
      } catch {
        // Offline or signed out; the next return or load tries again.
      }
    }
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) void check()
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [loadUnseen])

  if (tips.bookingIds.length === 0) return null
  const { bookingIds, totalAmount } = tips

  function close() {
    setTips({ bookingIds: [], totalAmount: 0 })
    void onSeen(bookingIds)
  }

  return (
    <>
      {/* Keyed on the tips so a new tip arriving later bursts again. */}
      <TealConfetti key={bookingIds.join(',')} />
      <ModalShell
        key={bookingIds.join(',')}
        onClose={close}
        labelledBy="tip-celebration-title"
        className="fixed inset-0 z-[60] flex items-center justify-center px-4"
        panelClassName="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
      >
        <p className="text-4xl" aria-hidden="true">🎉</p>
        <h2 id="tip-celebration-title" className="mt-2 text-xl font-bold text-slate-900">
          You received a tip!
        </h2>
        <p className="mt-4 text-5xl font-bold text-brand">${totalAmount.toFixed(2)}</p>
        <p className="mt-3 text-slate-600">Keep up the great work!</p>
        <button
          type="button"
          onClick={close}
          className="mt-6 w-full rounded-full bg-brand px-4 py-3 font-semibold text-white"
        >
          Thanks!
        </button>
      </ModalShell>
    </>
  )
}

// Tydio teal shades, from --color-brand and the sky-* scale it overrides.
const FALLBACK_COLORS = ['#38C7CA', '#93e0e2', '#52cfd2', '#2aa5a8', '#cdf1f2']

function tealColors(): string[] {
  const css = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return [
    read('--color-brand', FALLBACK_COLORS[0]),
    read('--color-sky-200', FALLBACK_COLORS[1]),
    read('--color-sky-400', FALLBACK_COLORS[2]),
    read('--color-sky-600', FALLBACK_COLORS[3]),
    read('--color-sky-100', FALLBACK_COLORS[4]),
  ]
}

// A short burst of falling confetti drawn on a canvas over the page.
function TealConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const colors = tealColors()
    const width = window.innerWidth
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * width,
      y: -20 - Math.random() * window.innerHeight * 0.6,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      size: 6 + Math.random() * 6,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      sway: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))

    const DURATION_MS = 4500
    const start = performance.now()
    let frame = 0
    const draw = (now: number) => {
      const elapsed = now - start
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      // Fades out over the last second.
      ctx.globalAlpha = Math.min(1, Math.max(0, (DURATION_MS - elapsed) / 1000))
      for (const p of pieces) {
        p.sway += 0.05
        p.x += p.vx + Math.sin(p.sway) * 0.8
        p.y += p.vy
        p.rotation += p.spin
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (elapsed < DURATION_MS) frame = requestAnimationFrame(draw)
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
    }
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70] h-full w-full" />
}
