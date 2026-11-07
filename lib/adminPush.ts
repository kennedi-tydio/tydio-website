import type { createAdminClient } from '@/lib/supabase/admin'

// Admin-composed push notifications (/admin/push-notifications).
// Only profiles with at least one push_subscriptions row can receive
// anything, so every audience is drawn from that set.

export const PUSH_AUDIENCES = ['all', 'customers', 'pros', 'selected'] as const
export type PushAudience = (typeof PUSH_AUDIENCES)[number]

export const PUSH_TITLE_MAX = 60
export const PUSH_BODY_MAX = 200

export type PushRecipient = {
  id: string
  role: 'USER' | 'TIDYPRO' | 'ADMIN'
  email: string
  firstName: string | null
  lastName: string | null
  devices: number
  // Earliest subscription across their devices.
  subscribedAt: string
}

export type AdminPushInput = {
  audience: PushAudience
  selectedIds: string[]
  title: string
  body: string
  url: string
}

export function parseAdminPushForm(formData: FormData): AdminPushInput | { error: string } {
  const audience = formData.get('audience') as PushAudience
  if (!PUSH_AUDIENCES.includes(audience)) return { error: 'Choose who to send to.' }

  const title = ((formData.get('title') as string) ?? '').trim()
  const body = ((formData.get('body') as string) ?? '').trim()
  const url = ((formData.get('url') as string) ?? '').trim() || '/'
  const selectedIds = formData.getAll('ids').map(String).filter(Boolean)

  if (!title) return { error: 'Subject is required.' }
  if (title.length > PUSH_TITLE_MAX) return { error: `Subject must be ${PUSH_TITLE_MAX} characters or fewer.` }
  if (!body) return { error: 'Body is required.' }
  if (body.length > PUSH_BODY_MAX) return { error: `Body must be ${PUSH_BODY_MAX} characters or fewer.` }
  // Same-site paths only, so a notification can't send people off to another domain.
  if (!url.startsWith('/') || url.startsWith('//')) return { error: 'Link must be a path on the site, like /pro.' }
  if (audience === 'selected' && selectedIds.length === 0) return { error: 'Select at least one person.' }

  return { audience, selectedIds, title, body, url }
}

// Everyone who currently has a subscribed device, with a device count.
export async function listPushRecipients(admin: ReturnType<typeof createAdminClient>): Promise<PushRecipient[]> {
  const { data: subs, error } = await admin.from('push_subscriptions').select('profile_id, created_at')
  if (error) throw error

  const devicesByProfile = new Map<string, number>()
  const firstSubscribed = new Map<string, string>()
  for (const s of subs ?? []) {
    devicesByProfile.set(s.profile_id, (devicesByProfile.get(s.profile_id) ?? 0) + 1)
    const earliest = firstSubscribed.get(s.profile_id)
    if (!earliest || s.created_at < earliest) firstSubscribed.set(s.profile_id, s.created_at)
  }
  if (devicesByProfile.size === 0) return []

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, role, email, first_name, last_name')
    .in('id', [...devicesByProfile.keys()])
  if (profilesError) throw profilesError

  return (profiles ?? [])
    .map((p) => ({
      id: p.id,
      role: p.role,
      email: p.email,
      firstName: p.first_name,
      lastName: p.last_name,
      devices: devicesByProfile.get(p.id) ?? 0,
      subscribedAt: firstSubscribed.get(p.id) ?? '',
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

export function pickRecipients(all: PushRecipient[], audience: PushAudience, selectedIds: string[]): PushRecipient[] {
  if (audience === 'all') return all.filter((r) => r.role !== 'ADMIN')
  if (audience === 'customers') return all.filter((r) => r.role === 'USER')
  if (audience === 'pros') return all.filter((r) => r.role === 'TIDYPRO')
  const wanted = new Set(selectedIds)
  return all.filter((r) => wanted.has(r.id))
}
