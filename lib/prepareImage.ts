// Phone photos are often 3–10MB. Shrinking them first makes the upload quick
// on mobile data and turns HEIC and other formats the browser can read into
// JPEG. Falls back to the original file if the browser can't decode it.
// Browser-only (uses canvas).
const MAX_EDGE = 1600

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void }

// createImageBitmap first; some browsers (older iOS Safari with HEIC, for one)
// can show a photo in an <img> but not decode it that way, so that's the fallback.
async function decode(file: File): Promise<Decoded | null> {
  try {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
  } catch {
    // Fall through to <img>.
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    if (!img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url)
      return null
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

export async function prepareImage(file: File): Promise<File> {
  try {
    const decoded = await decode(file)
    if (!decoded) return file
    const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(decoded.width * scale)
    canvas.height = Math.round(decoded.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      decoded.release()
      return file
    }
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
    decoded.release()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return file
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
