// The client-safe half of lib/tidyProPortfolio.ts: no server imports, so
// client components can use these.

import { isEntireHomeRoom } from './entireHome'

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

// ── A booking's before/after pairs ───────────────────────────────────────────
// What a Tidy Pro can add to their profile from a booking: one pair per after
// photo. A regular task has a single before and after photo; an Entire home
// task (booking_task_photos) and a Standard / Deep Cleaning
// (booking_cleaning_photos) can have several of each, so the Tidy Pro picks
// which before photo goes with each after photo.

export type PairPhoto = { id: string; url: string; path: string }

export type BookingPhotoPair = {
  // Which after photo the pair is made from (tidypro_portfolio_items.source_key).
  key: string
  // Shown under the pair on their profile: the task name, or the cleaning.
  label: string
  after: PairPhoto
  // The before photos it can be paired with, in the order they were taken.
  befores: PairPhoto[]
  // Our best guess at the matching before photo: the one taken in the same
  // position (1st after ↔ 1st before), or the last one.
  defaultBeforeId: string
  // Already on their profile.
  onProfile: boolean
}

export type BookingPhotoPairChoice = { key: string; beforeId: string }

type SourceTask = {
  id: string
  task_name: string
  task_category: string
  kind?: string | null
  before_photo_url: string | null
  completion_photo_url: string | null
}
type SourceTaskPhoto = { id: string; booking_task_id: string; kind: string; photo_url: string; photo_path: string }
type SourceCleaningPhoto = { id: string; kind: string; photo_url: string; photo_path: string }

function isCleaningKind(kind: string | null | undefined): boolean {
  return kind === 'full_service_home' || kind === 'full_service_room'
}

function pairsFromPhotos(
  keyPrefix: string,
  label: string,
  photos: { id: string; kind: string; photo_url: string; photo_path: string }[],
  addedKeys: Set<string>
): BookingPhotoPair[] {
  const toPhoto = (p: (typeof photos)[number]): PairPhoto => ({ id: p.id, url: p.photo_url, path: p.photo_path })
  const befores = photos.filter((p) => p.kind === 'before').map(toPhoto)
  const afters = photos.filter((p) => p.kind === 'after').map(toPhoto)
  if (befores.length === 0) return []
  return afters.map((after, i) => {
    const key = `${keyPrefix}:${after.id}`
    return {
      key,
      label,
      after,
      befores,
      defaultBeforeId: befores[Math.min(i, befores.length - 1)].id,
      onProfile: addedKeys.has(key),
    }
  })
}

export function buildBookingPhotoPairs(input: {
  tasks: SourceTask[]
  taskPhotos: SourceTaskPhoto[]
  cleaningPhotos: SourceCleaningPhoto[]
  // source_key of the pairs from this booking already on their profile.
  addedKeys: Set<string>
}): BookingPhotoPair[] {
  const { tasks, taskPhotos, cleaningPhotos, addedKeys } = input
  const pairs: BookingPhotoPair[] = []

  // The cleaning first: it's usually the main job.
  const cleaningRow = tasks.find((t) => isCleaningKind(t.kind))
  pairs.push(...pairsFromPhotos('cleaning', cleaningRow?.task_category || 'Cleaning', cleaningPhotos, addedKeys))

  for (const task of tasks) {
    if (isCleaningKind(task.kind)) continue
    const ownPhotos = taskPhotos.filter((p) => p.booking_task_id === task.id)
    if (isEntireHomeRoom(task.task_category) && ownPhotos.length > 0) {
      pairs.push(...pairsFromPhotos('task-photo', task.task_name, ownPhotos, addedKeys))
      continue
    }
    const beforePath = taskPhotoPathFromUrl(task.before_photo_url)
    const afterPath = taskPhotoPathFromUrl(task.completion_photo_url)
    if (!beforePath || !afterPath) continue
    const key = `task:${task.id}`
    const before = { id: key, url: task.before_photo_url!, path: beforePath }
    pairs.push({
      key,
      label: task.task_name,
      after: { id: key, url: task.completion_photo_url!, path: afterPath },
      befores: [before],
      defaultBeforeId: before.id,
      onProfile: addedKeys.has(key),
    })
  }
  return pairs
}
