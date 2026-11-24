import fs from 'node:fs'
import path from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'

// The Stripe test-mode accounts (scripts/stripe-test-mode/shared.ts). Their
// password is made by ui-setup.e2e.ts and kept in .state.json (not committed).
export const ACCOUNTS = {
  customer: 'kennedicoats773+stripetest@gmail.com',
  pro: 'rvrblossom+stripetest@gmail.com',
  pro2: 'rvrblossom+stripetest2@gmail.com',
} as const

const STATE_FILE = path.resolve(__dirname, '../scripts/stripe-test-mode/.state.json')

export function testState(): { customerId: string; proId: string; pro2Id: string; uiPassword: string } {
  const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  if (!s.uiPassword) throw new Error('No uiPassword in .state.json: run scripts/stripe-test-mode/ui-setup.e2e.ts first.')
  return s
}

export async function signIn(page: Page, who: keyof typeof ACCOUNTS) {
  await page.goto(who === 'customer' ? '/login' : '/login?role=pro')
  await page.getByLabel('Email').fill(ACCOUNTS[who])
  await page.getByLabel('Password', { exact: true }).fill(testState().uiPassword)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

export const shotDir = path.resolve(__dirname, '.results/shots')
export async function shot(page: Page, name: string) {
  fs.mkdirSync(shotDir, { recursive: true })
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true })
}

// Closes the sign-in pop-ups (text updates, add to home screen, notifications)
// that sit over the page for a fresh browser. Only the test account's choice.
export async function dismissPopups(page: Page) {
  const choices = [
    page.getByRole('button', { name: /^No thanks$/ }),
    page.getByRole('button', { name: /^Yes, I don't want texts$/ }),
    page.getByText('Add Tydio to your home screen').locator('xpath=ancestor::*[.//*[normalize-space()="Skip"]][1]').getByText('Skip', { exact: true }),
    page.getByRole('button', { name: /^(Not now|Maybe later)$/ }),
  ]
  for (let round = 0; round < 6; round++) {
    await page.waitForTimeout(600)
    let clicked = false
    for (const c of choices) {
      const el = c.first()
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 3000 }).catch(() => {})
        clicked = true
        break
      }
    }
    if (!clicked) return
  }
}

// From Home, starts a new Standard or Deep Cleaning, removing one left in progress.
export async function startCleaning(page: Page, type: 'Standard' | 'Deep' = 'Standard') {
  await page.goto('/dashboard')
  await dismissPopups(page)
  const book = page.getByRole('button', { name: new RegExp(`Book a ${type} Cleaning`) })
  const remove = page.getByRole('button', { name: /^Remove$/ })
  await expect(book.or(remove).first()).toBeVisible({ timeout: 60_000 })
  if (await remove.isVisible()) {
    await remove.click()
    const confirm = page.getByRole('button', { name: /^(Remove|Yes, remove|Delete)$/ }).nth(1)
    if (await confirm.isVisible({ timeout: 1500 }).catch(() => false)) await confirm.click()
  }
  await book.click()
  await expect(page.getByText('Step 1 of 5')).toBeVisible({ timeout: 90_000 })
}

// A test Tidy Pro who hasn't signed the current contractor agreement is sent to
// sign it first. Signs it as the test account (the copy is emailed to the + alias).
// `ready` is something on the page that was asked for, to tell the two apart.
export async function signAgreementIfAsked(page: Page, ready: Locator) {
  const form = page.locator('#legal_name')
  await expect(form.or(ready).first()).toBeVisible({ timeout: 90_000 })
  if (!(await form.isVisible())) return
  await dismissPopups(page)
  await form.fill('Testy Tidypro')
  await page.locator('#address').fill('1 Test Rd, Thomasville, GA 31792')
  await page.locator('input[name="agreed"]').check({ force: true })
  await page.getByRole('button', { name: 'Agree and Continue' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/pro/onboarding/agreements'), { timeout: 90_000 })
}
