import { describe, expect, it } from 'vitest'
import { taskPhotoPathFromUrl } from './portfolioItems'

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
