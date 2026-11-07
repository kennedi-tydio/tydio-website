// Rebuilds lib/zipCities.json from the GeoNames US postal code dump.
//
//   curl -LO https://download.geonames.org/export/zip/US.zip && unzip US.zip
//   node scripts/build-zip-cities.mjs path/to/US.txt
//
// GeoNames data is CC BY 4.0 (https://www.geonames.org). Military APO/FPO
// ZIPs have no state and are skipped.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = process.argv[2]
if (!source) {
  console.error('Usage: node scripts/build-zip-cities.mjs path/to/US.txt')
  process.exit(1)
}

const byState = {}
for (const line of readFileSync(source, 'utf8').split('\n')) {
  const [, zip, city, , state] = line.split('\t')
  if (!/^\d{5}$/.test(zip ?? '') || !city || !state) continue
  byState[state] ??= {}
  byState[state][zip] ??= city
}

const sorted = Object.fromEntries(
  Object.keys(byState)
    .sort()
    .map((state) => [state, Object.fromEntries(Object.entries(byState[state]).sort(([a], [b]) => a.localeCompare(b)))])
)
const out = fileURLToPath(new URL('../lib/zipCities.json', import.meta.url))
writeFileSync(out, JSON.stringify(sorted))
console.log(`Wrote ${Object.values(sorted).reduce((n, s) => n + Object.keys(s).length, 0)} ZIPs to ${out}`)
