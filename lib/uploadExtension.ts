const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

// The storage path's extension comes from the file type we already checked,
// never from the uploader's file name, which could carry "/" or "..".
export function extensionForType(type: string): string {
  return EXTENSIONS[type] ?? 'bin'
}
