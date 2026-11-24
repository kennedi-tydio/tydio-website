import path from 'node:path'
import { test, expect } from '@playwright/test'
import { dismissPopups, shot, signAgreementIfAsked, signIn } from './helpers'

// Tidy Pro: remove one before/after pair with its X, or tick several and remove them together.
const PHOTO = path.resolve(__dirname, '../public/email-logo.png')

test('Tidy Pro removes photo pairs one at a time or several at once', async ({ page }) => {
  await signIn(page, 'pro')
  await page.goto('/pro/profile/edit')
  const section = page.locator('#cleaning-photos')
  await signAgreementIfAsked(page, section)
  if (!page.url().includes('/pro/profile/edit')) await page.goto('/pro/profile/edit')
  await dismissPopups(page)
  await expect(section).toBeVisible({ timeout: 90_000 })
  const pairs = section.locator('ul > li')
  const startCount = await pairs.count()

  // Three pairs to work with.
  for (const caption of ['E2E pair A', 'E2E pair B', 'E2E pair C']) {
    await section.getByRole('button', { name: /Add (more )?before & after photos/ }).click()
    await section.locator('#cleaning-photo-before').setInputFiles(PHOTO)
    await section.locator('#cleaning-photo-after').setInputFiles(PHOTO)
    await section.locator('#cleaning-photo-caption').fill(caption)
    await section.getByRole('button', { name: 'Add to profile' }).click()
    await expect(section.getByText(caption, { exact: true })).toBeVisible({ timeout: 60_000 })
  }
  await expect(pairs).toHaveCount(Math.min(startCount + 3, 12))

  // Select two, remove them together.
  await section.getByRole('button', { name: 'Select photos to remove' }).click()
  const removeBtn = section.getByRole('button', { name: /^Remove/ })
  await expect(removeBtn).toBeDisabled()
  await section.getByLabel('Select E2E pair A photos').check()
  await section.getByText('E2E pair B', { exact: true }).click() // tapping the pair ticks it too
  await expect(removeBtn).toHaveText('Remove (2)')
  await shot(page, 'portfolio-selecting')
  page.once('dialog', (d) => {
    expect(d.message()).toBe('Remove these 2 before & after photo pairs from your profile?')
    void d.accept()
  })
  await removeBtn.click()
  await expect(section.getByText('E2E pair A', { exact: true })).toHaveCount(0)
  await expect(section.getByText('E2E pair B', { exact: true })).toHaveCount(0)
  await expect(section.getByText('E2E pair C', { exact: true })).toBeVisible()
  await expect(section.getByRole('button', { name: 'Select photos to remove' }).or(section.getByLabel(/^Remove E2E/)).first()).toBeVisible()

  // Still gone after a reload.
  await page.reload()
  await expect(section.getByText('E2E pair C', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(section.getByText('E2E pair A', { exact: true })).toHaveCount(0)

  // The X still removes a single pair.
  page.once('dialog', (d) => void d.accept())
  await section.getByLabel('Remove E2E pair C photos from your profile').click()
  await expect(section.getByText('E2E pair C', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(section).toBeVisible({ timeout: 60_000 })
  await expect(section.getByText(/^E2E pair/)).toHaveCount(0)
})
