// The client-safe half of lib/tidyProPortfolio.ts: no server imports, so
// client components can use these.

// The public bucket task completion (after) and before photos live in. Kept in
// step with COMPLETION_PHOTOS_BUCKET in lib/taskPhotoRetention.ts.
const TASK_PHOTOS_BUCKET = 'task-photos'

// How many items the customer-facing profile shows.
export const PORTFOLIO_DISPLAY_LIMIT = 12

// Caption a Tidy Pro types for a photo they upload themselves.
export const PORTFOLIO_CAPTION_MAX_LENGTH = 60

// Uploads are refused once a Tidy Pro has this many items on their profile.
export const PORTFOLIO_MAX_ITEMS = 100

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
