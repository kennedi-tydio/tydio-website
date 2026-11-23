import type { TidyTask } from '@/app/dashboard/types'

// The fallback for when automatic pricing (the OpenAI estimate, and the pet
// photo check) is down. Instead of blocking Add Task, the task is saved as
// needing a quote, and a booking with any such task is sent to the chosen
// Tidy Pro as a quote request (lib/quoteRequests.ts) rather than charged up
// front. The Tidy Pro quotes each task in dollars. Pure and dependency-free,
// so client components can import it.

// A task needing a quote, or quoted, holds the longest a Tidy Task can take
// on the calendar: the Tidy Pro quotes a price, not a time.
export const QUOTE_PLACEHOLDER_MINUTES = 30

// What the customer pays for one task, before any Top Tidy Pro / distance
// surcharge and the card fee. The Tidy Pro earns 80% of it, as usual.
export const MIN_QUOTE_PRICE = 1
export const MAX_QUOTE_PRICE = 500

export const QUOTE_TASK_LABEL = 'Quote from your Tidy Pro'

export const AI_UNAVAILABLE_TASK_MESSAGE =
  'We can’t price this task automatically right now. You can still add it: your Tidy Pro will send you a quote before you pay anything.'

export const AI_UNAVAILABLE_PHOTO_MESSAGE =
  'We can’t check photos automatically right now. You can still add this task: your Tidy Pro will look at your photos and send you a quote before you pay anything.'

type QuoteFields = Pick<TidyTask, 'needsQuote'> & { completed?: boolean }

export function needsQuote(task: QuoteFields): boolean {
  return task.needsQuote === true
}

export function hasQuoteTasks(tasks: QuoteFields[]): boolean {
  return tasks.some(needsQuote)
}

// Whole cents, within the limits.
export function isValidQuotePrice(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_QUOTE_PRICE &&
    value <= MAX_QUOTE_PRICE &&
    Math.abs(Math.round(value * 100) - value * 100) < 1e-6
  )
}

// The task list with the Tidy Pro's price filled in for every task that
// needed a quote. Null if any of them is missing or out of range.
export function applyQuote(tasks: TidyTask[], pricesByTaskId: Record<string, unknown>): TidyTask[] | null {
  const quoted: TidyTask[] = []
  for (const task of tasks) {
    if (!needsQuote(task)) {
      quoted.push(task)
      continue
    }
    const price = pricesByTaskId[task.id]
    if (!isValidQuotePrice(price)) return null
    quoted.push({ ...task, needsQuote: false, quotedByTidyPro: true, quotedPrice: Math.round(price * 100) / 100 })
  }
  return quoted
}

// A Tidy Pro's price only ever comes from a quote request, server-side. A task
// that reaches a customer's own task list with one (sent from the browser, or
// put back after a canceled booking) goes back to needing a quote, so nobody
// can set their own price or reuse one Tidy Pro's quote with another.
export function withoutTidyProQuote(task: TidyTask): TidyTask {
  if (task.quotedPrice == null && !task.quotedByTidyPro) return task
  return { ...task, quotedPrice: null, quotedByTidyPro: null, needsQuote: true }
}
