'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { addUploadedPortfolioItem, removePortfolioItems, type UploadedPortfolioPhoto } from '@/lib/tidyProPortfolio'
import { PORTFOLIO_CAPTION_MAX_LENGTH, PORTFOLIO_MAX_ITEMS, type PortfolioItem } from '@/lib/portfolioItems'

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024

// One photo from the form: null when the field is empty, an error message when it is unusable.
async function readPhoto(value: FormDataEntryValue | null): Promise<UploadedPortfolioPhoto | null | string> {
  if (!(value instanceof File) || value.size === 0) return null
  if (!ALLOWED_PHOTO_TYPES.includes(value.type)) return 'Please upload a JPG, PNG, or WEBP photo.'
  if (value.size > MAX_PHOTO_SIZE_BYTES) return 'Photo is too large — please upload something under 10MB.'
  const contentType = value.type === 'image/jpg' ? 'image/jpeg' : (value.type as UploadedPortfolioPhoto['contentType'])
  return { body: Buffer.from(await value.arrayBuffer()), contentType }
}

// A Tidy Pro uploads a before/after pair of their work from their device, with
// a short caption. Their oldest pair drops off once they're past the limit.
export async function uploadPortfolioPhotoAction(formData: FormData): Promise<{ item: PortfolioItem } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const caption = String(formData.get('caption') ?? '').replace(/\s+/g, ' ').trim()
  if (!caption) return { error: 'Add a short caption, like “Kitchen deep clean”.' }
  if (caption.length > PORTFOLIO_CAPTION_MAX_LENGTH) {
    return { error: `Keep the caption under ${PORTFOLIO_CAPTION_MAX_LENGTH} characters.` }
  }

  const before = await readPhoto(formData.get('before'))
  if (typeof before === 'string') return { error: before }
  if (!before) return { error: 'Please choose a before photo.' }
  const after = await readPhoto(formData.get('after'))
  if (typeof after === 'string') return { error: after }
  if (!after) return { error: 'Please choose an after photo of the finished work.' }

  const admin = createAdminClient()

  let item: PortfolioItem
  try {
    item = await addUploadedPortfolioItem(admin, session.profileId, caption, { before, after })
  } catch (err) {
    console.error('[Tydio] Uploading portfolio photo failed:', err)
    return { error: "We couldn't upload that photo — please try another." }
  }

  revalidatePath('/pro/profile/edit')
  revalidatePath('/pro/profile/preview')
  revalidatePath(`/book/schedule/${session.profileId}`)
  return { item }
}

// Takes one pair or several off the Tidy Pro's profile. Only their own pairs
// are touched; ids that aren't theirs are ignored.
export async function removePortfolioItemsAction(itemIds: string[]): Promise<{ success: true } | { error: string }> {
  const session = await getSession()
  if (!session || session.role !== 'TIDYPRO') return { error: 'Not authorized' }

  const ids = [...new Set(Array.isArray(itemIds) ? itemIds.filter((id) => typeof id === 'string') : [])]
  if (ids.length === 0 || ids.length > PORTFOLIO_MAX_ITEMS) return { error: 'Choose the photos to remove.' }

  const admin = createAdminClient()
  const { data: items } = await admin
    .from('tidypro_portfolio_items')
    .select('id, before_photo_path, after_photo_path')
    .in('id', ids)
    .eq('tidypro_id', session.profileId)
  if (!items || items.length === 0) return { error: 'Photo not found.' }

  try {
    await removePortfolioItems(admin, items)
  } catch {
    return { error: items.length > 1 ? "We couldn't remove those photos. Please try again." : "We couldn't remove that photo. Please try again." }
  }

  revalidatePath('/pro/profile/edit')
  revalidatePath('/pro/profile/preview')
  revalidatePath(`/book/schedule/${session.profileId}`)
  return { success: true }
}
