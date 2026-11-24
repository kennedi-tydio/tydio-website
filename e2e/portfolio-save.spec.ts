import path from 'node:path'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { dismissPopups, shot, signAgreementIfAsked, signIn } from './helpers'

// Tidy Pro: the Edit Profile page's Save button also adds a before/after pair
// that's been picked but not yet added, then offers to add more.
const PHOTO = path.resolve(__dirname, '../public/email-logo.png')

async function openEditProfile(page: Page): Promise<Locator> {
  await page.goto('/pro/profile/edit')
  const section = page.locator('#cleaning-photos')
  await signAgreementIfAsked(page, section)
  if (!page.url().includes('/pro/profile/edit')) await page.goto('/pro/profile/edit')
  await dismissPopups(page)
  await expect(section).toBeVisible({ timeout: 90_000 })
  return section
}

test('Save adds picked cleaning photos and offers to add more', async ({ page }) => {
  await signIn(page, 'pro')
  const section = await openEditProfile(page)
  const save = page.getByRole('button', { name: 'Save', exact: true })
  const saved = page.getByText('Your profile has been saved.')
  const addButton = section.getByRole('button', { name: /Add (more )?before & after photos/ })
  const caption = `E2E save pair ${Date.now()}`

  try {
    // 1. Pick a pair and caption, then tap the page's Save, not "Add to profile".
    await addButton.click()
    await section.locator('#cleaning-photo-before').setInputFiles(PHOTO)
    await section.locator('#cleaning-photo-after').setInputFiles(PHOTO)
    await section.locator('#cleaning-photo-caption').fill(caption)
    await save.click()

    await expect(saved).toBeVisible({ timeout: 60_000 })
    await expect(section.getByText(caption, { exact: true })).toBeVisible()
    await expect(section.locator('#cleaning-photo-caption')).toHaveCount(0) // form closed
    await expect(section.getByRole('button', { name: '+ Add more before & after photos' })).toBeVisible()
    await shot(page, 'portfolio-save-added')

    // Still there after a reload.
    await page.reload()
    await expect(section.getByText(caption, { exact: true })).toBeVisible({ timeout: 60_000 })

    // 2. A half-filled pair stops the save and keeps what was picked.
    await section.getByRole('button', { name: '+ Add more before & after photos' }).click()
    await section.locator('#cleaning-photo-before').setInputFiles(PHOTO)
    await save.click()
    await expect(section.getByRole('alert')).toHaveText('Choose an after photo of the finished work.')
    await expect(page.getByText('Finish adding your cleaning photos above, or tap Cancel, then save again.')).toBeVisible()
    await expect(saved).toHaveCount(0)
    await expect(section.getByAltText('Before preview')).toBeVisible() // picked photo kept
    await shot(page, 'portfolio-save-half-filled')

    // Cancel, then Save works again.
    await section.getByRole('button', { name: 'Cancel' }).click()
    await save.click()
    await expect(saved).toBeVisible({ timeout: 60_000 })

    // 3. An opened but untouched form just closes on Save.
    await section.getByRole('button', { name: '+ Add more before & after photos' }).click()
    await expect(section.locator('#cleaning-photo-caption')).toBeVisible()
    await save.click()
    await expect(saved).toBeVisible({ timeout: 60_000 })
    await expect(section.locator('#cleaning-photo-caption')).toHaveCount(0)
    await expect(section.getByText(caption, { exact: true })).toHaveCount(1) // nothing extra added
  } finally {
    // Take the test pair back off the profile.
    await page.goto('/pro/profile/edit')
    await expect(section).toBeVisible({ timeout: 90_000 })
    const remove = section.getByLabel(`Remove ${caption} photos from your profile`)
    if (await remove.isVisible({ timeout: 10_000 }).catch(() => false)) {
      page.once('dialog', (d) => void d.accept())
      await remove.click()
      await expect(section.getByText(caption, { exact: true })).toHaveCount(0, { timeout: 60_000 })
    }
  }
})
