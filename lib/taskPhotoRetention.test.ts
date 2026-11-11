import { describe, expect, it } from 'vitest'
import type { TidyTask } from '@/app/dashboard/types'
import { isTaskPriceable } from '@/app/dashboard/isTaskPriceable'
import { bookingPhotosExpired, retentionCutoff, stripDeletedPhotos, unbookedPhotosToDelete } from './taskPhotoRetention'

const now = new Date('2026-11-20T12:00:00Z')
const cutoff = retentionCutoff(now)
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

describe('bookingPhotosExpired', () => {
  const ended = { status: 'completed', ended_at: daysAgo(8), incident_reported_at: null, incident_resolved_at: null }

  it('expires 7 days after the booking ends', () => {
    expect(bookingPhotosExpired(ended, cutoff)).toBe(true)
    expect(bookingPhotosExpired({ ...ended, ended_at: daysAgo(6) }, cutoff)).toBe(false)
    expect(bookingPhotosExpired({ ...ended, status: 'cancelled' }, cutoff)).toBe(true)
  })

  it('keeps photos on open bookings, however old', () => {
    expect(bookingPhotosExpired({ ...ended, status: 'pending' }, cutoff)).toBe(false)
    expect(bookingPhotosExpired({ ...ended, status: 'scheduled' }, cutoff)).toBe(false)
    expect(bookingPhotosExpired({ ...ended, ended_at: null }, cutoff)).toBe(false)
  })

  it('keeps photos until 7 days after a reported incident is settled', () => {
    const reported = { ...ended, incident_reported_at: daysAgo(9) }
    expect(bookingPhotosExpired(reported, cutoff)).toBe(false)
    expect(bookingPhotosExpired({ ...reported, incident_resolved_at: daysAgo(3) }, cutoff)).toBe(false)
    expect(bookingPhotosExpired({ ...reported, incident_resolved_at: daysAgo(7.5) }, cutoff)).toBe(true)
  })
})

describe('unbookedPhotosToDelete', () => {
  it('deletes photos 7+ days old that no booking still needs', () => {
    const files = [
      { path: 'u1/old.jpg', createdAt: daysAgo(8) },
      { path: 'u1/new.jpg', createdAt: daysAgo(2) },
      { path: 'u1/booked.jpg', createdAt: daysAgo(30) },
      { path: 'u1/unknown.jpg', createdAt: null },
    ]
    expect(unbookedPhotosToDelete(files, new Set(['u1/booked.jpg']), cutoff)).toEqual(['u1/old.jpg'])
  })
})

describe('stripDeletedPhotos', () => {
  const task = (photos: string[]): TidyTask => ({
    id: 't1',
    name: 'Clean rabbit cage',
    notes: '',
    room: 'Bedroom',
    dirtLevel: null,
    unusual: [],
    completed: false,
    tier: 'Standard',
    estimatedMinutes: 20,
    pet: { kind: 'enclosure', petType: 'Rabbit', scope: 'x', photos },
  })

  it('takes deleted photos off draft tasks, leaving the task unbookable once none are left', () => {
    const { tasks, changed } = stripDeletedPhotos([task(['u1/a.jpg', 'u1/b.jpg'])], new Set(['u1/a.jpg']))
    expect(changed).toBe(true)
    expect(tasks[0].pet?.photos).toEqual(['u1/b.jpg'])
    expect(isTaskPriceable(tasks[0])).toBe(true)

    const emptied = stripDeletedPhotos(tasks, new Set(['u1/b.jpg'])).tasks[0]
    expect(emptied.pet?.photos).toEqual([])
    expect(isTaskPriceable(emptied)).toBe(false)
  })

  it('leaves drafts alone when none of their photos were deleted', () => {
    expect(stripDeletedPhotos([task(['u1/a.jpg'])], new Set(['u2/x.jpg'])).changed).toBe(false)
  })
})
