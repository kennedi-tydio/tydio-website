// The app's loading wheel: a teal arc turning on a pale track.
export function LoadingSpinner({ size = 40 }: { size?: number }) {
  return (
    <span role="status" aria-label="Loading" className="inline-flex">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className="animate-spin motion-reduce:animate-none" aria-hidden="true">
        <circle cx="20" cy="20" r="16" stroke="#e8f9fa" strokeWidth="4" />
        <path d="M20 4a16 16 0 0116 16" stroke="var(--color-brand)" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

// Fills the space a page is about to load into. Used by the loading.tsx files, which
// each re-export this, so a route's loading state looks the same everywhere.
export default function LoadingScreen() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white">
      <LoadingSpinner />
    </div>
  )
}
