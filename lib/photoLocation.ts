// Reads the GPS position from a photo's raw EXIF block (sharp's
// metadata().exif). Task photos are stripped of metadata before they go in a
// public bucket, so this is how Tydio keeps where a photo was taken: the
// coordinates are saved on booking_tasks, which only the server reads.

export type PhotoLocation = { latitude: number; longitude: number }

const GPS_IFD_POINTER = 0x8825
const GPS_LATITUDE_REF = 1
const GPS_LATITUDE = 2
const GPS_LONGITUDE_REF = 3
const GPS_LONGITUDE = 4
const TYPE_ASCII = 2
const TYPE_RATIONAL = 5

type Entry = { type: number; count: number; valueOffset: number }

export function readPhotoLocation(exif: Buffer | undefined | null): PhotoLocation | null {
  if (!exif || exif.length < 14) return null
  try {
    // sharp includes the "Exif\0\0" APP1 header; a bare TIFF block works too.
    const start = exif.toString('latin1', 0, 4) === 'Exif' ? 6 : 0
    const order = exif.toString('latin1', start, start + 2)
    if (order !== 'II' && order !== 'MM') return null
    const little = order === 'II'
    const u16 = (at: number) => (little ? exif.readUInt16LE(start + at) : exif.readUInt16BE(start + at))
    const u32 = (at: number) => (little ? exif.readUInt32LE(start + at) : exif.readUInt32BE(start + at))
    if (u16(2) !== 42) return null

    const readIfd = (offset: number): Map<number, Entry> => {
      const entries = new Map<number, Entry>()
      const count = u16(offset)
      for (let i = 0; i < count; i++) {
        const at = offset + 2 + i * 12
        // Values of 4 bytes or less sit in the entry itself; larger ones are at an offset.
        entries.set(u16(at), { type: u16(at + 2), count: u32(at + 4), valueOffset: at + 8 })
      }
      return entries
    }

    const gpsPointer = readIfd(u32(4)).get(GPS_IFD_POINTER)
    if (!gpsPointer) return null
    const gps = readIfd(u32(gpsPointer.valueOffset))

    const ref = (tag: number): string | null => {
      const e = gps.get(tag)
      if (!e || e.type !== TYPE_ASCII) return null
      return String.fromCharCode(exif[start + e.valueOffset])
    }
    const degrees = (tag: number): number | null => {
      const e = gps.get(tag)
      if (!e || e.type !== TYPE_RATIONAL || e.count < 3) return null
      const base = u32(e.valueOffset)
      const parts = [0, 1, 2].map((i) => {
        const den = u32(base + i * 8 + 4)
        return den === 0 ? NaN : u32(base + i * 8) / den
      })
      const value = parts[0] + parts[1] / 60 + parts[2] / 3600
      return Number.isFinite(value) ? value : null
    }

    const lat = degrees(GPS_LATITUDE)
    const lng = degrees(GPS_LONGITUDE)
    if (lat == null || lng == null || lat > 90 || lng > 180) return null
    const latitude = ref(GPS_LATITUDE_REF) === 'S' ? -lat : lat
    const longitude = ref(GPS_LONGITUDE_REF) === 'W' ? -lng : lng
    // 0,0 is what some cameras write when they have no fix.
    if (latitude === 0 && longitude === 0) return null
    return { latitude, longitude }
  } catch {
    // Truncated or malformed EXIF: no location rather than a failed upload.
    return null
  }
}
