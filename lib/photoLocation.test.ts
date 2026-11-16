import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { readPhotoLocation } from './photoLocation'
import { prepareTaskPhoto } from './tidyProPortfolio'

async function jpegWithGps(gps: Record<string, string> | null): Promise<Buffer> {
  const image = sharp({ create: { width: 8, height: 8, channels: 3, background: '#38c7ca' } })
  return (gps ? image.withExif({ IFD3: gps }) : image).jpeg().toBuffer()
}

describe('readPhotoLocation', () => {
  it('reads north/west coordinates', async () => {
    const photo = await jpegWithGps({
      GPSLatitudeRef: 'N',
      GPSLatitude: '33/1 45/1 0/1',
      GPSLongitudeRef: 'W',
      GPSLongitude: '84/1 23/1 2400/100',
    })
    const { exif } = await sharp(photo).metadata()
    const location = readPhotoLocation(exif)
    expect(location?.latitude).toBeCloseTo(33.75, 6)
    expect(location?.longitude).toBeCloseTo(-(84 + 23 / 60 + 24 / 3600), 6)
  })

  it('reads south/east coordinates', async () => {
    const photo = await jpegWithGps({
      GPSLatitudeRef: 'S',
      GPSLatitude: '33/1 52/1 0/1',
      GPSLongitudeRef: 'E',
      GPSLongitude: '151/1 12/1 0/1',
    })
    const { exif } = await sharp(photo).metadata()
    expect(readPhotoLocation(exif)).toEqual({ latitude: expect.closeTo(-33.8667, 3), longitude: expect.closeTo(151.2, 3) })
  })

  it('returns null without GPS tags or for bad data', async () => {
    const plain = await sharp(await jpegWithGps(null)).metadata()
    expect(readPhotoLocation(plain.exif)).toBeNull()
    expect(readPhotoLocation(undefined)).toBeNull()
    expect(readPhotoLocation(Buffer.from('Exif\0\0garbage-not-tiff'))).toBeNull()
    expect(readPhotoLocation(Buffer.from('Exif\0\0II*\0\xff\xff\xff\xff', 'latin1'))).toBeNull()
  })
})

describe('prepareTaskPhoto', () => {
  it('keeps the location privately and strips it from the file', async () => {
    const photo = await jpegWithGps({
      GPSLatitudeRef: 'N',
      GPSLatitude: '33/1 45/1 0/1',
      GPSLongitudeRef: 'W',
      GPSLongitude: '84/1 23/1 0/1',
    })
    const { body, location } = await prepareTaskPhoto(photo, 'image/jpeg')
    expect(location?.latitude).toBeCloseTo(33.75, 6)
    const after = await sharp(body).metadata()
    expect(readPhotoLocation(after.exif)).toBeNull()
  })
})
