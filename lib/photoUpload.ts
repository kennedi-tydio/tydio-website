// Builds the form a Tidy Pro's job photo is uploaded with. Browser-only.
//
// Vercel refuses any request over 4.5MB before it reaches the app, and a
// phone photo is often bigger than that, so the photo is shrunk first
// (prepareImage). Shrinking drops the photo's EXIF, which is where the
// server reads the location Tydio keeps privately (lib/photoLocation.ts), so
// the original's EXIF block goes along as a small separate field.
import { prepareImage } from './prepareImage'

// Under Vercel's 4.5MB request limit, with room for the rest of the form.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
// EXIF lives in a JPEG's first segments and is at most 64KB.
const EXIF_SEARCH_BYTES = 256 * 1024

export const PHOTO_TOO_LARGE_MESSAGE = 'That photo is too large to upload. Please take a new photo or choose a different one.'
export const PHOTO_UPLOAD_FAILED_MESSAGE = 'The photo didn’t upload. Check your connection and try again.'
export const PHOTO_REMOVE_FAILED_MESSAGE = 'The photo wasn’t removed. Check your connection and try again.'

export async function photoUploadForm(file: File): Promise<FormData | { error: string }> {
  const [photo, exif] = await Promise.all([prepareImage(file), readJpegExif(file)])
  if (photo.size > MAX_UPLOAD_BYTES) return { error: PHOTO_TOO_LARGE_MESSAGE }
  const form = new FormData()
  form.append('photo', photo)
  if (exif) form.append('exif', exif)
  return form
}

// The APP1 "Exif" segment of a JPEG (from its "Exif" header on), or null.
export async function readJpegExif(file: Blob): Promise<Blob | null> {
  try {
    const bytes = new Uint8Array(await file.slice(0, EXIF_SEARCH_BYTES).arrayBuffer())
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
    let at = 2
    while (at + 4 <= bytes.length && bytes[at] === 0xff) {
      const marker = bytes[at + 1]
      // Start of the image data, or its end: no more metadata segments.
      if (marker === 0xda || marker === 0xd9) return null
      const length = (bytes[at + 2] << 8) | bytes[at + 3]
      if (
        marker === 0xe1 &&
        bytes[at + 4] === 0x45 && // E
        bytes[at + 5] === 0x78 && // x
        bytes[at + 6] === 0x69 && // i
        bytes[at + 7] === 0x66 // f
      ) {
        const end = at + 2 + length
        return end <= bytes.length ? new Blob([bytes.slice(at + 4, end)]) : null
      }
      at += 2 + length
    }
    return null
  } catch {
    return null
  }
}
