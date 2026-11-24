import { expect, type Page } from '@playwright/test'
import { dismissPopups } from './helpers'

// Steps through the customer's Standard / Deep Cleaning booking flow.

export type WizardOptions = {
  type?: 'Standard' | 'Deep'
  // Specific rooms instead of the entire home, e.g. { Kitchens: 1, 'Full bathrooms': 1 }.
  rooms?: Record<string, number>
}

// From Home: starts a new cleaning (removing one left in progress) and
// stops on the Tidy Tasks step.
export async function wizardToTasks(page: Page, opts: WizardOptions = {}) {
  await page.goto('/dashboard')
  await dismissPopups(page)
  const book = page.getByRole('button', { name: new RegExp(`Book a ${opts.type ?? 'Standard'} Cleaning`) })
  const remove = page.getByRole('button', { name: /^Remove$/ })
  await expect(book.or(remove).first()).toBeVisible({ timeout: 90_000 })
  if (await remove.isVisible()) {
    await remove.click()
    await expect(book).toBeVisible({ timeout: 30_000 })
  }
  await book.click()

  await expect(page.getByText('Step 1 of 5')).toBeVisible({ timeout: 90_000 })
  if (opts.rooms) {
    await page.getByText('Specific Rooms', { exact: true }).click()
    for (const [plural, n] of Object.entries(opts.rooms)) {
      for (let i = 0; i < n; i++) await page.getByRole('button', { name: `More: ${plural}` }).click()
    }
  }
  for (const step of [1, 2, 3]) {
    await expect(page.getByText(`Step ${step} of 5`)).toBeVisible({ timeout: 90_000 })
    await continueStep(page)
  }
  await expect(page.getByText('Step 4 of 5')).toBeVisible({ timeout: 90_000 })
}

export async function continueStep(page: Page) {
  await page.getByRole('button', { name: /^(Continue|Skip|Review booking)$/ }).last().click()
}

// A Tidy Task row on the Tidy Tasks step or Home.
export function taskRow(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name}`) }).and(page.locator('[aria-pressed]'))
}

// From the Tidy Tasks step on to Review: Notes, Your Booking, search at
// Stripe Test Home (4 days out unless told otherwise), Tidy Pro One, 10:00 AM.
export async function tasksToReview(page: Page, daysAhead = 4) {
  await expect(page.getByText('Step 4 of 5')).toBeVisible({ timeout: 90_000 })
  await continueStep(page)
  await expect(page.getByText('Step 5 of 5')).toBeVisible({ timeout: 90_000 })
  await continueStep(page)
  await page.waitForURL((u) => u.pathname === '/book', { timeout: 90_000 })
  await page.getByRole('button', { name: /^Continue$/ }).or(page.getByRole('link', { name: /^Continue$/ })).first().click()
  await searchAndChoose(page, daysAhead)
}

export async function searchAndChoose(page: Page, daysAhead = 4) {
  await page.waitForURL((u) => u.pathname === '/book/schedule', { timeout: 90_000 })
  const choose = page.getByRole('button', { name: 'Choose an address' })
  const chosen = page.getByRole('button', { name: 'Stripe Test Home', exact: true })
  await expect(choose.or(chosen).first()).toBeVisible({ timeout: 90_000 })
  if (await choose.isVisible()) {
    await choose.click()
    await page.getByRole('button', { name: /^Stripe Test Home/ }).click()
  }
  await page.getByRole('button', { name: /^Expand date$/ }).click()
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  if (d.getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('button', { name: String(d.getDate()), exact: true }).click()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Searching…' })).toHaveCount(0, { timeout: 90_000 })
  const pro = page.getByRole('link', { name: /^Stripe Test Pro / }).first()
  await expect(pro).toBeVisible({ timeout: 60_000 })
  await page.getByRole('link', { name: 'Book', exact: true }).first().click()
  // A time already chosen for this request goes straight on to Review.
  const review = page.getByRole('heading', { name: 'Review Your Request' })
  const ten = page.getByRole('button', { name: '10:00 AM', exact: true })
  const confirm = page.getByRole('button', { name: 'Confirm time' })
  await expect(confirm.or(review).first()).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(1500) // the time page can show briefly before moving on to Review
  if (await confirm.isVisible()) {
    // Coming back to this step, the earlier time is still picked; tapping it again would unpick it.
    if (await confirm.isDisabled()) await ten.click()
    await confirm.click()
  }
  await page.waitForURL((u) => u.pathname === '/book/review', { timeout: 90_000 })
  await expect(review).toBeVisible({ timeout: 90_000 })
}
