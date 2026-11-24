import { test, expect, type Page } from '@playwright/test'
import { ACCOUNTS, dismissPopups, testState } from './helpers'

// The home-screen app opening on the homepage (an icon added before the
// manifest's start_url was /login) goes to login, or straight to Home when
// signed in with "Stay signed in". A normal browser still gets the website.

// What iPhone Safari sets for a page opened from a home-screen icon.
async function asHomeScreenApp(page: Page) {
  await page.addInitScript(() => Object.defineProperty(window.navigator, 'standalone', { value: true }))
}

test('the website still shows in a normal browser', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(1500)
  expect(new URL(page.url()).pathname).toBe('/')
})

test('signed out, the home-screen app opens on login', async ({ page }) => {
  await asHomeScreenApp(page)
  await page.goto('/')
  await page.waitForURL((u) => u.pathname === '/login', { timeout: 60_000 })
  await expect(page.getByLabel('Email')).toBeVisible()
})

test('with Stay signed in, the home-screen app opens right on Home', async ({ page, context }) => {
  await asHomeScreenApp(page)
  await page.goto('/login')
  await page.getByLabel('Email').fill(ACCOUNTS.customer)
  await page.getByLabel('Password', { exact: true }).fill(testState().uiPassword)
  await page.locator('#remember').check()
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 60_000 })

  const cookie = (await context.cookies()).find((c) => c.name === 'tydio_session')
  expect(cookie?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 60 * 60) // kept for 30 days

  // Close and reopen the app: a new page on the homepage.
  const reopened = await context.newPage()
  await asHomeScreenApp(reopened)
  await reopened.goto('/')
  await reopened.waitForURL((u) => u.pathname === '/dashboard', { timeout: 60_000 })
  await dismissPopups(reopened)
  await expect(reopened.getByRole('heading', { name: 'Bookings' })).toBeVisible({ timeout: 60_000 })
})
