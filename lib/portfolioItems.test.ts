import { describe, expect, it } from 'vitest'
import { buildBookingPhotoPairs, taskPhotoPathFromUrl } from './portfolioItems'

const BASE = 'https://abc.supabase.co/storage/v1/object/public/task-photos/'

describe('taskPhotoPathFromUrl', () => {
  it('returns the path inside the task-photos bucket', () => {
    expect(taskPhotoPathFromUrl(`${BASE}booking-1/task-2-before-123.jpg`)).toBe('booking-1/task-2-before-123.jpg')
  })

  it('drops a query string', () => {
    expect(taskPhotoPathFromUrl(`${BASE}booking-1/a.jpg?t=1`)).toBe('booking-1/a.jpg')
  })

  it('rejects other buckets, empty values and path tricks', () => {
    expect(taskPhotoPathFromUrl(null)).toBeNull()
    expect(taskPhotoPathFromUrl('')).toBeNull()
    expect(taskPhotoPathFromUrl('https://abc.supabase.co/storage/v1/object/public/profile-photos/x.jpg')).toBeNull()
    expect(taskPhotoPathFromUrl(`${BASE}../profile-photos/x.jpg`)).toBeNull()
    expect(taskPhotoPathFromUrl(`${BASE}a/%2E%2E/b.jpg`)).toBeNull()
    expect(taskPhotoPathFromUrl(`${BASE}%E0%A4%A`)).toBeNull()
  })
})

describe('buildBookingPhotoPairs', () => {
  const task = (over: Record<string, unknown>) => ({
    id: 't1',
    task_name: 'Wipe counters',
    task_category: 'Kitchen',
    kind: 'task',
    before_photo_url: null,
    completion_photo_url: null,
    ...over,
  })
  const photo = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind,
    photo_url: `${BASE}b1/${id}.jpg`,
    photo_path: `b1/${id}.jpg`,
    ...extra,
  })

  it('pairs a task with a before and an after photo', () => {
    const pairs = buildBookingPhotoPairs({
      tasks: [
        task({ before_photo_url: `${BASE}b1/before.jpg`, completion_photo_url: `${BASE}b1/after.jpg` }),
        task({ id: 't2', completion_photo_url: `${BASE}b1/only-after.jpg` }),
      ],
      taskPhotos: [],
      cleaningPhotos: [],
      addedKeys: new Set(),
    })
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({
      key: 'task:t1',
      label: 'Wipe counters',
      after: { path: 'b1/after.jpg' },
      befores: [{ id: 'task:t1', path: 'b1/before.jpg' }],
      defaultBeforeId: 'task:t1',
      onProfile: false,
    })
  })

  it('makes one pair per after photo of an Entire home task, matching befores by position', () => {
    const pairs = buildBookingPhotoPairs({
      tasks: [task({ task_name: 'Baseboards', task_category: 'Entire home', before_photo_url: `${BASE}b1/b1.jpg`, completion_photo_url: `${BASE}b1/a1.jpg` })],
      taskPhotos: [
        { ...photo('b1', 'before'), booking_task_id: 't1' },
        { ...photo('b2', 'before'), booking_task_id: 't1' },
        { ...photo('a1', 'after'), booking_task_id: 't1' },
        { ...photo('a2', 'after'), booking_task_id: 't1' },
        { ...photo('a3', 'after'), booking_task_id: 't1' },
      ],
      cleaningPhotos: [],
      addedKeys: new Set(['task-photo:a2']),
    })
    expect(pairs.map((p) => [p.key, p.defaultBeforeId, p.onProfile])).toEqual([
      ['task-photo:a1', 'b1', false],
      ['task-photo:a2', 'b2', true],
      ['task-photo:a3', 'b2', false],
    ])
    expect(pairs[0].befores.map((b) => b.id)).toEqual(['b1', 'b2'])
  })

  it('pairs a cleaningâ€™s photos under its name, and skips them without a before photo', () => {
    const tasks = [task({ id: 'home', task_name: 'Deep Cleaning: Entire home', task_category: 'Deep Cleaning', kind: 'full_service_home' })]
    const pairs = buildBookingPhotoPairs({
      tasks,
      taskPhotos: [],
      cleaningPhotos: [photo('cb', 'before'), photo('ca', 'after')],
      addedKeys: new Set(),
    })
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ key: 'cleaning:ca', label: 'Deep Cleaning', defaultBeforeId: 'cb' })

    expect(buildBookingPhotoPairs({ tasks, taskPhotos: [], cleaningPhotos: [photo('ca', 'after')], addedKeys: new Set() })).toEqual([])
  })
})
