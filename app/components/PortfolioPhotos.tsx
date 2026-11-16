import type { PortfolioItem } from '@/lib/portfolioItems'

// The photos of one work-photo item: a before/after pair side by side, or a
// single photo across the same space (same height either way, so a row of
// mixed items lines up).
export default function PortfolioPhotos({ item }: { item: PortfolioItem }) {
  if (!item.beforeUrl) {
    return (
      <div className="rounded-xl overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.afterUrl}
          alt={item.taskName}
          loading="lazy"
          className="w-full aspect-[2/1] object-cover bg-slate-100"
        />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
      {[
        { label: 'Before', url: item.beforeUrl },
        { label: 'After', url: item.afterUrl },
      ].map((photo) => (
        <div key={photo.label} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt={`${item.taskName} — ${photo.label.toLowerCase()}`}
            loading="lazy"
            className="w-full aspect-square object-cover bg-slate-100"
          />
          <span className="absolute bottom-1 left-1 text-[10px] font-semibold text-white bg-black/60 rounded px-1.5 py-0.5">
            {photo.label}
          </span>
        </div>
      ))}
    </div>
  )
}
