import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MIN_PLAUSIBLE_PRICE = 60
const MAX_PLAUSIBLE_PRICE = 500

export async function researchAreaMarketPrice(area: {
  name: string
  city: string | null
  state: string
}): Promise<{ price: number; summary: string }> {
  const location = area.city ? `${area.city}, ${area.state}` : `${area.name}, ${area.state}`

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    tools: [{ type: 'web_search' }],
    temperature: 0,
    input: `Search angi.com (Angi, formerly Angie's List) — and only angi.com — for its published cost guide on professional home cleaning services covering ${location}. Angi is the sole source of truth for this figure; do not use any other site's listings or quotes. Use the typical/average price Angi reports for a standard full-service cleaning of a 2-3 bedroom home in or near this area (fall back to Angi's broader regional or national figure only if it has nothing specific to this area, and say so in the summary).

Respond with JSON only, no markdown formatting: { "price": number, "summary": string }
- price: the typical/average price for a standard full-service cleaning, in whole USD, as reported by Angi.
- summary: a 1-2 sentence citation naming the specific Angi figure/page used (and noting if it was a regional/national fallback).`,
  })

  const raw = response.output_text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(raw) as { price?: unknown; summary?: unknown }

  const price = typeof parsed.price === 'number' ? parsed.price : Number(parsed.price)
  if (!Number.isFinite(price) || price < MIN_PLAUSIBLE_PRICE || price > MAX_PLAUSIBLE_PRICE) {
    throw new Error(`Market price research returned an implausible value: ${String(parsed.price)}`)
  }

  return {
    price: Math.round(price),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  }
}

// Same research approach as researchAreaMarketPrice, generalized to a whole
// state (median across its major metros) rather than one named service area,
// and framed around a 4-hour cleaning session to match the booking pricing
// formula. This is an admin-triggered suggestion only — the admin still
// reviews/saves it; nothing here writes to the database directly.
//
// Anchored to a single named source (Angi) rather than an open-ended web
// search: an unconstrained search pulls from a different, shifting mix of
// listings each run, so the same state can come back with a noticeably
// different number every time it's regenerated. Pinning to one canonical
// source — plus temperature 0 — makes repeated runs land on the same figure
// far more consistently.
export async function researchStateMedianPrice(state: string): Promise<{ price: number; summary: string }> {
  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    tools: [{ type: 'web_search' }],
    temperature: 0,
    input: `Search angi.com (Angi, formerly Angie's List) — and only angi.com — for its published cost guide on professional home cleaning services in ${state} (a US state). Angi is the sole source of truth for this figure; do not use any other cleaning company's site or listings. Use the typical/average price Angi reports for a standard 4-hour cleaning session on a 2-3 bedroom home in this state (fall back to Angi's national figure only if it doesn't break pricing out by state, and say so in the summary).

Respond with JSON only, no markdown formatting: { "price": number, "summary": string }
- price: the typical/average price for a standard 4-hour cleaning session, in whole USD, as reported by Angi for this state.
- summary: a 1-2 sentence citation naming the specific Angi figure/page used (and noting if it was a national fallback).`,
  })

  const raw = response.output_text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const parsed = JSON.parse(raw) as { price?: unknown; summary?: unknown }

  const price = typeof parsed.price === 'number' ? parsed.price : Number(parsed.price)
  if (!Number.isFinite(price) || price < MIN_PLAUSIBLE_PRICE || price > MAX_PLAUSIBLE_PRICE) {
    throw new Error(`State price research returned an implausible value: ${String(parsed.price)}`)
  }

  return {
    price: Math.round(price),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  }
}
