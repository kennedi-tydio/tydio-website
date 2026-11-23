import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { endReviewDetour, returnToReview, startReviewDetour } from './reviewDetour'

const PETS = '/dashboard/profile/pets'
const PAYMENT = '/dashboard/profile/payment-methods'

function fakeStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  }
}

function fakeRouter() {
  return { back: vi.fn(), push: vi.fn() }
}

let historyLength = 3

beforeEach(() => {
  historyLength = 3
  vi.stubGlobal('sessionStorage', fakeStorage())
  vi.stubGlobal('window', {
    history: {
      get length() {
        return historyLength
      },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('returnToReview', () => {
  it('goes back in history when the detour was opened from Review', () => {
    startReviewDetour(PETS)
    const router = fakeRouter()
    returnToReview(router, PETS)
    expect(router.back).toHaveBeenCalledOnce()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('opens Review when the detour page was not opened from Review', () => {
    const router = fakeRouter()
    returnToReview(router, PETS)
    expect(router.push).toHaveBeenCalledWith('/book/review')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('opens Review when Review sent the customer to a different detour', () => {
    startReviewDetour(PAYMENT)
    const router = fakeRouter()
    returnToReview(router, PETS)
    expect(router.push).toHaveBeenCalledWith('/book/review')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('opens Review when there is no history to go back through', () => {
    startReviewDetour(PETS)
    historyLength = 1
    const router = fakeRouter()
    returnToReview(router, PETS)
    expect(router.push).toHaveBeenCalledWith('/book/review')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('only goes back once per detour', () => {
    startReviewDetour(PETS)
    returnToReview(fakeRouter(), PETS)
    const router = fakeRouter()
    returnToReview(router, PETS)
    expect(router.push).toHaveBeenCalledWith('/book/review')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('opens Review after the customer came back to Review some other way', () => {
    startReviewDetour(PETS)
    endReviewDetour() // e.g. the browser's own Back button returned them to Review
    const router = fakeRouter()
    returnToReview(router, PETS)
    expect(router.push).toHaveBeenCalledWith('/book/review')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('still returns to Review when sessionStorage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => startReviewDetour(PETS)).not.toThrow()
    expect(() => endReviewDetour()).not.toThrow()
    const router = fakeRouter()
    returnToReview(router, PETS)
    expect(router.push).toHaveBeenCalledWith('/book/review')
  })
})
