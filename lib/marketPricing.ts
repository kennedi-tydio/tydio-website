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
    input: `Search for current prices of professional home cleaning services for a standard 2-3 bedroom home in ${location}.
Look at real listings, pricing pages, or quotes from local cleaning companies.

Respond with JSON only, no markdown formatting: { "price": number, "summary": string }
- price: your best-effort estimate, in whole USD, of the typical price for a standard full-service cleaning in this area.
- summary: a 1-2 sentence citation of what you found (e.g. company names or price ranges seen).`,
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
export async function researchStateMedianPrice(state: string): Promise<{ price: number; summary: string }> {
  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    tools: [{ type: 'web_search' }],
    input: `Search for current prices of professional home cleaning services across ${state} (a US state), for a standard 4-hour cleaning session on a 2-3 bedroom home. Look at real listings, pricing pages, or quotes from cleaning companies in several of the state's major cities.

Respond with JSON only, no markdown formatting: { "price": number, "summary": string }
- price: your best-effort estimate, in whole USD, of the median price for a standard 4-hour cleaning across this state.
- summary: a 1-2 sentence citation of what you found (e.g. company names, cities, or price ranges seen).`,
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
