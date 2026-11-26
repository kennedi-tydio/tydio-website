// Rebuilds lib/zipCoordinates.json (ZIP -> [latitude, longitude]) from the
// GeoNames US postal code dump, the same file build-zip-cities.mjs reads.
//
//   curl -LO https://download.geonames.org/export/zip/US.zip && unzip US.zip
//   node scripts/build-zip-coordinates.mjs path/to/US.txt
//
// GeoNames data is CC BY 4.0 (https://www.geonames.org). Each point is the
// ZIP's approximate center, rounded to 3 decimals (~100 m), which is plenty
// for comparing against a Tidy Pro's travel radius in miles.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = process.argv[2]
if (!source) {
  console.error('Usage: node scripts/build-zip-coordinates.mjs path/to/US.txt')
  process.exit(1)
}

const byZip = {}
for (const line of readFileSync(source, 'utf8').split('\n')) {
  const cols = line.split('\t')
  const zip = cols[1]
  const lat = parseFloat(cols[9])
  const lng = parseFloat(cols[10])
  if (!/^\d{5}$/.test(zip ?? '') || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
  byZip[zip] ??= [Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000]
}

const sorted = Object.fromEntries(Object.entries(byZip).sort(([a], [b]) => a.localeCompare(b)))
const out = fileURLToPath(new URL('../lib/zipCoordinates.json', import.meta.url))
writeFileSync(out, JSON.stringify(sorted))
console.log(`Wrote ${Object.keys(sorted).length} ZIPs to ${out}`)
