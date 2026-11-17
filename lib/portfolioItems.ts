// The client-safe half of lib/tidyProPortfolio.ts: no server imports, so
// client components can use these.

// The public bucket task completion (after) and before photos live in. Kept in
// step with COMPLETION_PHOTOS_BUCKET in lib/taskPhotoRetention.ts.
const TASK_PHOTOS_BUCKET = 'task-photos'

// The most before/after pairs a Tidy Pro keeps on their profile. Adding one
// past this (an upload or a booking's pair) pushes the oldest out
// (pruneOldPortfolioItems in lib/tidyProPortfolio.ts).
export const PORTFOLIO_MAX_ITEMS = 12

// How many items the customer-facing profile shows: all of them.
export const PORTFOLIO_DISPLAY_LIMIT = PORTFOLIO_MAX_ITEMS

// Caption a Tidy Pro types for a photo they upload themselves.
export const PORTFOLIO_CAPTION_MAX_LENGTH = 60

export type PortfolioItem = {
  id: string
  // The task name for a booking's pair, or the caption of an upload.
  taskName: string
  // Null for a single uploaded photo with no before shot.
  beforeUrl: string | null
  afterUrl: string
}

// The storage path inside the task-photos bucket for a public URL stored on
// booking_tasks (".../storage/v1/object/public/task-photos/<path>"), or null
// for anything else.
export function taskPhotoPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${TASK_PHOTOS_BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  let path: string
  try {
    path = decodeURIComponent(url.slice(i + marker.length).split('?')[0])
  } catch {
    return null
  }
  if (!path || path.split('/').some((part) => part === '..' || part === '')) return null
  return path
}
