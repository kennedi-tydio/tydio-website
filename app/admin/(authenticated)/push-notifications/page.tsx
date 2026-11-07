import { createAdminClient } from '@/lib/supabase/admin'
import { listPushRecipients } from '@/lib/adminPush'
import PushNotificationForm from './PushNotificationForm'
import SubscriberList from './SubscriberList'

export default async function PushNotificationsPage() {
  const recipients = (await listPushRecipients(createAdminClient())).filter((r) => r.role !== 'ADMIN')
  const customers = recipients.filter((r) => r.role === 'USER').length
  const pros = recipients.filter((r) => r.role === 'TIDYPRO').length

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Push Notifications</h1>
      <p className="text-sm text-slate-500 mb-6">
        Only people who turned on push notifications can get these. Right now that&apos;s {customers}{' '}
        {customers === 1 ? 'customer' : 'customers'} and {pros} Tidy {pros === 1 ? 'Pro' : 'Pros'}.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] items-start">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <PushNotificationForm recipients={recipients} />
        </div>
        <SubscriberList recipients={recipients} />
      </div>
    </div>
  )
}
