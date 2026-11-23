import { createAdminClient } from '@/lib/supabase/admin'
import { listPromoCodesForAdmin, listPromoRecipientCandidates } from '@/lib/promoCodesData'
import PromoCodesAdmin from './PromoCodesAdmin'
import PromoFailures, { type PromoFailure } from './PromoFailures'

export default async function PromoCodesPage() {
  const admin = createAdminClient()
  const [promos, customers, { data: recipients }, { data: failures }] = await Promise.all([
    listPromoCodesForAdmin(admin),
    listPromoRecipientCandidates(admin),
    admin.from('promo_code_recipients').select('promo_code_id, profile_id'),
    admin.from('promo_code_failures').select('*').order('created_at', { ascending: false }).limit(200),
  ])

  // Who each code has already been emailed to, so the picker can say so.
  const emailedTo: Record<string, string[]> = {}
  for (const r of recipients ?? []) (emailedTo[r.promo_code_id] ??= []).push(r.profile_id)

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Promo Codes</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-3xl">
        A code takes money off what the customer pays for one booking. The Tidy Pro is still paid 80% of the full,
        undiscounted price after the booking is completed; Tydio covers the discount. You set how many times each customer
        can use a code; on a recurring booking it only applies to the first visit.
      </p>
      <div className="space-y-6">
        <PromoFailures failures={(failures ?? []) as PromoFailure[]} />
        <PromoCodesAdmin promos={promos} customers={customers} emailedTo={emailedTo} />
      </div>
    </div>
  )
}
