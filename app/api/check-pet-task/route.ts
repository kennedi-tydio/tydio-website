import { NextRequest, NextResponse } from 'next/server'
import { checkPetTaskPhotos } from '@/lib/aiTaskEstimate'
import { getSession } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { RATE_LIMITS, isRateLimited, recordRateLimitEvent } from '@/lib/rateLimit'
import {
  CUSTOMER_TASK_PHOTOS_BUCKET,
  MAX_PET_TASK_PHOTOS,
  isLitterOption,
  isOwnTaskPhotoPath,
  isPetTaskKind,
} from '@/lib/petTasks'

const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

// Checks the photos for a pet enclosure / litter box task and, once they pass,
// estimates it. Same sign-in rule and hourly allowance as /api/validate-task,
// since both are paid AI calls.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'USER') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as {
    kind?: unknown
    name?: unknown
    petType?: unknown
    litterOption?: unknown
    notes?: unknown
    photos?: unknown
  } | null
  if (!body || !isPetTaskKind(body.kind)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const photos = Array.isArray(body.photos) ? body.photos : []
  if (photos.length === 0 || photos.length > MAX_PET_TASK_PHOTOS || !photos.every((p) => isOwnTaskPhotoPath(p, session.profileId))) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  const litterOption = isLitterOption(body.litterOption) ? body.litterOption : null
  if (body.kind === 'litterBox' && !litterOption) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

  const admin = createAdminClient()
  const key = `task-estimate:user:${session.profileId}`
  if (await isRateLimited(admin, key, RATE_LIMITS.taskEstimatePerUser)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  await recordRateLimitEvent(admin, key)

  try {
    const dataUrls = await Promise.all(
      (photos as string[]).map(async (path) => {
        const { data, error } = await admin.storage.from(CUSTOMER_TASK_PHOTOS_BUCKET).download(path)
        if (error || !data) throw new Error(`Couldn't read ${path}: ${error?.message ?? 'no data'}`)
        const ext = path.split('.').pop() ?? 'jpg'
        const base64 = Buffer.from(await data.arrayBuffer()).toString('base64')
        return `data:${CONTENT_TYPE[ext] ?? 'image/jpeg'};base64,${base64}`
      })
    )

    const result = await checkPetTaskPhotos({
      kind: body.kind,
      name: str(body.name, 200),
      petType: body.kind === 'enclosure' ? str(body.petType, 60) || null : null,
      litterOption,
      notes: str(body.notes, 1000),
      photos: dataUrls,
    })
    return NextResponse.json(result)
  } catch (err) {
    // The AI provider or storage failed, not the photo. The customer can
    // check the same photos again.
    console.error('[Tydio] Pet task photo check failed:', err)
    return NextResponse.json({ error: 'check_unavailable' }, { status: 503 })
  }
}
