import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationPayload } from '@/lib/notifications'

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) throw new Error('VAPID env vars are not set')
  webpush.setVapidDetails('mailto:hello@tydio.com', publicKey, privateKey)
}

// Fans out to every device the profile has subscribed from. No consent
// check needed here — a profile with zero subscription rows (never
// opted in, or revoked) naturally results in zero sends.
export async function sendPush(profileId: string, title: string, body: string, url: string): Promise<void> {
  const admin = createAdminClient()
  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('profile_id', profileId)

  if (!subscriptions || subscriptions.length === 0) return

  configureWebPush()

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url })
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired/revoked — clean it up so future sends
          // don't keep failing against a dead endpoint.
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    })
  )
}

export async function sendPushForPayload(profileId: string, payload: NotificationPayload): Promise<void> {
  await sendPush(profileId, payload.title, payload.body, payload.url)
}
