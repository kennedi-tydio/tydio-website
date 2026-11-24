import { test, expect, type Page } from '@playwright/test'
import { taskRow, tasksToReview, wizardToTasks } from './booking'
import { clearSavedDirections, latestDraft, resetCustomerDraft, savedDirections } from './db'
import { shot, signIn } from './helpers'

// Run sheet section 2, "Customer: booking steps"
// (https://claude.ai/artifact/JqqQNxh3KsbbuURdWByLPD#s2), as the test customer.

const DIRECTIONS = 'E2E: gate code 4321, use the side door'
const NOTES = 'E2E: please water the fern'
const saveBox = (page: Page) => page.getByRole('checkbox', { name: /Save these directions for future bookings at/ })

// From any booking page, taps the page's own Back until the Tidy Tasks step.
// Returns every page it passed through.
async function backToTidyTasks(page: Page): Promise<string[]> {
  const seen: string[] = []
  for (let i = 0; i < 8; i++) {
    if (new URL(page.url()).pathname === '/book/full-service/tasks') {
      await expect(page.getByText('Step 4 of 5')).toBeVisible({ timeout: 90_000 })
      return seen
    }
    const before = page.url()
    const back = page.getByRole('button', { name: 'Back', exact: true }).or(page.getByRole('link', { name: 'Back', exact: true })).first()
    await expect(back).toBeVisible({ timeout: 90_000 })
    await back.click()
    await page.waitForURL((u) => u.href !== before, { timeout: 90_000 })
    await page.waitForLoadState('domcontentloaded')
    seen.push(new URL(page.url()).pathname)
  }
  throw new Error(`Never reached the Tidy Tasks step: ${seen.join(' → ')}`)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, 'customer')
})

test('s2-notes: directions, notes and the save tick survive Pets → Edit and going back through the flow', async ({ page }) => {
  await clearSavedDirections()
  await resetCustomerDraft()
  await wizardToTasks(page)
  await tasksToReview(page)

  await page.locator('#entry-instructions').fill(DIRECTIONS)
  await page.locator('#booking-notes').fill(NOTES)
  await saveBox(page).check()
  await page.locator('#booking-notes').blur()
  await page.waitForTimeout(1500) // saved on the draft after 600ms

  // Pets → Edit, then back to Review the way the pets page offers.
  await page.locator('a[href^="/dashboard/profile/pets"]').click()
  await page.waitForURL((u) => u.pathname === '/dashboard/profile/pets', { timeout: 90_000 })
  const toBooking = page.getByRole('button', { name: /^Continue( to booking)?$/ })
  await expect(toBooking.first()).toBeVisible({ timeout: 60_000 })
  await toBooking.first().click()
  await page.waitForURL((u) => u.pathname === '/book/review', { timeout: 90_000 })
  await expect(page.locator('#entry-instructions')).toHaveValue(DIRECTIONS)
  await expect(page.locator('#booking-notes')).toHaveValue(NOTES)
  await expect(saveBox(page)).toBeChecked()

  // Your reported problem: Back from Review went to the pets page. It should
  // go to the last booking step (Choose a time).
  const path = await backToTidyTasks(page)
  console.log('Back from Review went through:', path.join(' → '))
  expect(path[0]).toMatch(/^\/book\/schedule\/[^/]+\/time$/)
  expect(path).not.toContain('/dashboard/profile/pets')

  // And forward again to Review: all still there.
  await tasksToReview(page)
  await expect(page.locator('#entry-instructions')).toHaveValue(DIRECTIONS)
  await expect(page.locator('#booking-notes')).toHaveValue(NOTES)
  await expect(saveBox(page)).toBeChecked()
  await shot(page, 's2-notes-review')
})

test('s2-back: ticked Tidy Tasks stay ticked going back from Review, and the same-bathroom question comes back', async ({ page }) => {
  await resetCustomerDraft([
    { name: 'Scrub toilet', room: 'Bathroom' },
    { name: 'Dust shelves', room: 'Living room' },
  ])
  await wizardToTasks(page, { rooms: { Kitchens: 1, 'Full bathrooms': 1 } })

  const toilet = taskRow(page, 'Scrub toilet')
  const shelves = taskRow(page, 'Dust shelves')
  await shelves.click()
  await expect(shelves).toHaveAttribute('aria-pressed', 'true')
  await toilet.click()
  await expect(page.getByRole('button', { name: 'Different bathroom' })).toBeVisible()
  await page.getByRole('button', { name: 'Different bathroom' }).click()
  await expect(toilet).toHaveAttribute('aria-pressed', 'true')

  await tasksToReview(page)
  await expect(page.getByText('Scrub toilet').first()).toBeVisible()
  await backToTidyTasks(page)
  await expect(toilet).toHaveAttribute('aria-pressed', 'true')
  await expect(shelves).toHaveAttribute('aria-pressed', 'true')

  await toilet.click()
  await expect(toilet).toHaveAttribute('aria-pressed', 'false')
  await toilet.click()
  await expect(page.getByRole('button', { name: 'Different bathroom' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Same bathroom' })).toBeVisible()
  await shot(page, 's2-back-question')
})

test('s2-keep: ticking on Home just selects; deleting every Tidy Task keeps the cleaning and empties its Tidy Tasks step', async ({ page }) => {
  await resetCustomerDraft([
    { name: 'Scrub toilet', room: 'Bathroom' },
    { name: 'Dust shelves', room: 'Living room' },
  ])
  await wizardToTasks(page) // a Standard Cleaning in progress
  await page.goto('/dashboard')
  await expect(page.getByText('Your Standard Cleaning')).toBeVisible({ timeout: 90_000 })

  const del = page.getByRole('button', { name: 'Delete selected tasks' })
  await expect(del).toBeDisabled()
  for (const name of ['Scrub toilet', 'Dust shelves']) {
    await taskRow(page, name).click()
    await expect(taskRow(page, name)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('dialog')).toHaveCount(0) // no pop-up
  }
  await expect(del).toBeEnabled()
  page.on('dialog', (d) => void d.accept())
  await del.click()
  const confirm = page.getByRole('dialog').getByRole('button', { name: /^(Delete|Yes, delete|Remove)/ })
  if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.click()

  await expect(taskRow(page, 'Scrub toilet')).toHaveCount(0, { timeout: 30_000 })
  await expect(taskRow(page, 'Dust shelves')).toHaveCount(0)
  // Saved: no tasks left on the draft, the cleaning still on it.
  await expect.poll(latestDraft, { timeout: 30_000 }).toEqual({ tasks: [], hasCleaning: true })
  await page.reload()
  await expect(page.getByText('Your Standard Cleaning')).toBeVisible({ timeout: 90_000 })
  await expect(taskRow(page, 'Scrub toilet')).toHaveCount(0)
  await shot(page, 's2-keep-home')

  await page.getByRole('button', { name: 'Continue booking' }).click()
  await page.waitForURL(/\/book\/full-service\//, { timeout: 90_000 })
  await page.goto('/book/full-service/tasks')
  await expect(page.getByText('Step 4 of 5')).toBeVisible({ timeout: 90_000 })
  await expect(taskRow(page, 'Scrub toilet')).toHaveCount(0)
  await expect(taskRow(page, 'Dust shelves')).toHaveCount(0)
  await shot(page, 's2-keep-tasks-step')
})

test('s2-saved: directions saved with a booking fill in the next booking at the same address', async ({ page }) => {
  test.setTimeout(420_000)
  await clearSavedDirections()
  await resetCustomerDraft()
  await wizardToTasks(page)
  await tasksToReview(page)

  await page.locator('#entry-instructions').fill(DIRECTIONS)
  await saveBox(page).check()
  await page.locator('#entry-instructions').blur()
  await page.waitForTimeout(1500)

  // A card, if the test customer has none: Stripe's 4242 test card.
  const addCard = page.getByRole('link', { name: 'Add payment method', exact: true })
  if (await addCard.isVisible()) {
    await addCard.click()
    await page.waitForURL(/payment-methods/, { timeout: 90_000 })
    await page.getByRole('button', { name: 'Add payment method', exact: true }).click()
    await addTestCard(page)
    await page.getByRole('button', { name: 'Select payment method' }).click()
    await page.waitForURL((u) => u.pathname === '/book/review', { timeout: 90_000 })
    await expect(page.getByText(/•••• 4242/)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#entry-instructions')).toHaveValue(DIRECTIONS)
    await expect(saveBox(page)).toBeChecked()
  }

  const confirm = page.getByRole('button', { name: 'Confirm Request' })
  await confirm.click()
  await page.waitForURL(/\/dashboard\/messages\//, { timeout: 120_000 })
  expect(await savedDirections()).toBe(DIRECTIONS)

  // A second booking at the same address (another day: Tidy Pro One now has the first).
  await wizardToTasks(page)
  await tasksToReview(page, 5)
  await expect(page.locator('#entry-instructions')).toHaveValue(DIRECTIONS)
  const saved = page.getByRole('checkbox', { name: /^Saved for future bookings at/ })
  await expect(saved).toBeChecked()
  await expect(saved).toBeDisabled()
  await shot(page, 's2-saved-review')
})

async function addTestCard(page: Page) {
  const frame = page.frameLocator('iframe[title*="payment input" i]').first()
  await frame.locator('input[name="number"]').fill('4242424242424242')
  await frame.locator('input[name="expiry"]').fill('1234')
  await frame.locator('input[name="cvc"]').fill('123')
  const zip = frame.locator('input[name="postalCode"]')
  if (await zip.isVisible().catch(() => false)) await zip.fill('31792')
  // Stripe's test-mode developer tools frame sits over the button.
  await page.getByRole('button', { name: 'Save card' }).dispatchEvent('click')
  await expect(page.getByText(/4242/).first()).toBeVisible({ timeout: 60_000 })
}
