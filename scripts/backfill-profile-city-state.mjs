// Fills profiles.city / profiles.state from zip_code for accounts created
// before migration 054. Only touches rows with a ZIP and no city or state yet.
//
//   node --env-file=.env.local scripts/backfill-profile-city-state.mjs          # dry run
//   node --env-file=.env.local scripts/backfill-profile-city-state.mjs --write  # apply
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const write = process.argv.includes('--write')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env.local).')
  process.exit(1)
}

// Same lookup as lib/zipLocation.ts.
const zipCities = JSON.parse(readFileSync(new URL('../lib/zipCities.json', import.meta.url), 'utf8'))
const byZip = new Map()
for (const [state, zips] of Object.entries(zipCities)) {
  for (const [zip, city] of Object.entries(zips)) byZip.set(zip, { city, state })
}
const lookup = (zip) => byZip.get(zip?.trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1]) ?? null

const admin = createClient(url, key, { auth: { persistSession: false } })

const rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, zip_code')
    .not('zip_code', 'is', null)
    .or('city.is.null,state.is.null')
    .order('id')
    .range(from, from + 999)
  if (error) {
    console.error('Loading profiles failed:', error.message)
    process.exit(1)
  }
  rows.push(...data)
  if (data.length < 1000) break
}

let updated = 0
const unknown = []
for (const row of rows) {
  const location = lookup(row.zip_code)
  if (!location) {
    unknown.push(row.zip_code)
    continue
  }
  if (write) {
    const { error } = await admin.from('profiles').update(location).eq('id', row.id)
    if (error) {
      console.error(`Updating ${row.id} failed:`, error.message)
      continue
    }
  }
  updated++
}

console.log(`${rows.length} profiles missing a city/state; ${updated} ${write ? 'updated' : 'would be updated'}.`)
if (unknown.length) console.log(`No match for ${unknown.length} ZIP(s): ${[...new Set(unknown)].join(', ')}`)
if (!write) console.log('Dry run. Re-run with --write to apply.')
