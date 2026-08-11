import { createAdminClient } from '@/lib/supabase/admin'
import { activateStatePricingAction, deactivateStatePricingAction, researchStatePriceAction } from '../../actions'
import { US_STATES, findUsState } from '@/lib/usStates'
import StatePriceForm from './StatePriceForm'
import EditStatePriceForm from './EditStatePriceForm'

export default async function StatePricingPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state = '' } = await searchParams
  const admin = createAdminClient()

  let query = admin.from('state_pricing').select('*').order('state', { ascending: true })
  if (state) query = query.eq('state', state)

  const [{ data: prices }, { data: areas }, { data: profiles }] = await Promise.all([
    query,
    admin.from('service_areas').select('id, state'),
    admin.from('profiles').select('zip_code, booking_access_status').eq('role', 'USER'),
  ])

  const { data: allZips } = await admin.from('service_area_zip_codes').select('service_area_id, zip_code')

  // Roll up waitlisted/booking-allowed user counts by state, via each
  // service area's ZIP codes — same join used by the Service Areas page.
  const areaStateById = new Map((areas ?? []).map((a) => [a.id, a.state]))
  const countsByState = new Map<string, { waitlisted: number; bookingAllowed: number }>()
  for (const zip of allZips ?? []) {
    const zipState = areaStateById.get(zip.service_area_id)
    if (!zipState) continue
    const usersInZip = (profiles ?? []).filter((p) => p.zip_code === zip.zip_code)
    const counts = countsByState.get(zipState) ?? { waitlisted: 0, bookingAllowed: 0 }
    counts.waitlisted += usersInZip.filter((u) => u.booking_access_status === 'waitlisted').length
    counts.bookingAllowed += usersInZip.filter((u) => u.booking_access_status === 'booking_allowed').length
    countsByState.set(zipState, counts)
  }

  const pricedStates = new Set((prices ?? []).filter((p) => p.pricing_active).map((p) => p.state))
  const statesWithAreas = new Set((areas ?? []).map((a) => a.state))
  const needsPricing = [...statesWithAreas]
    .filter((s) => !pricedStates.has(s))
    .map((s) => ({ state: s, ...(countsByState.get(s) ?? { waitlisted: 0, bookingAllowed: 0 }) }))

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">State Pricing</h1>

      {/* Add state price */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <h2 className="font-semibold text-slate-900 text-sm mb-4">Add a State Price</h2>
        <StatePriceForm />
      </div>

      {/* Needs pricing */}
      {needsPricing.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-100 shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-slate-900 text-sm mb-1">Needs Pricing</h2>
          <p className="text-xs text-slate-500 mb-3">
            These states have service areas but no active median price — customers there will see
            &quot;Instant pricing is not currently available.&quot;
          </p>
          <div className="flex flex-wrap gap-2">
            {needsPricing.map((s) => (
              <span
                key={s.state}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-white border border-amber-200 text-amber-700"
              >
                {findUsState(s.state)?.name ?? s.state}
                {s.bookingAllowed > 0 && ` · ${s.bookingAllowed} booking-allowed`}
                {s.waitlisted > 0 && ` · ${s.waitlisted} waitlisted`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <form method="get" className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          name="state"
          defaultValue={state}
          className="w-52 px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-[#38C7CA]"
        >
          <option value="">All states</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: '#38C7CA' }}
        >
          Filter
        </button>
        {state && (
          <a href="/admin/state-pricing" className="text-sm text-slate-400 underline">
            Clear
          </a>
        )}
      </form>

      {/* State price list */}
      {(prices ?? []).length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-slate-400 text-sm">No states match your filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(prices ?? []).map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-semibold text-slate-900">{findUsState(p.state)?.name ?? p.state}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Updated {new Date(p.updated_at).toLocaleDateString()}</p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      color: p.pricing_active ? '#22c55e' : '#64748b',
                      backgroundColor: p.pricing_active ? '#22c55e1a' : '#64748b1a',
                    }}
                  >
                    {p.pricing_active ? 'Active' : 'Inactive'}
                  </span>

                  <EditStatePriceForm statePricingId={p.id} currentPrice={p.median_four_hour_price} />

                  <form action={researchStatePriceAction}>
                    <input type="hidden" name="state" value={p.state} />
                    <button
                      type="submit"
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      Refresh with AI
                    </button>
                  </form>

                  {p.pricing_active ? (
                    <form action={deactivateStatePricingAction.bind(null, p.id)}>
                      <button
                        type="submit"
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                      >
                        Deactivate
                      </button>
                    </form>
                  ) : (
                    <form action={activateStatePricingAction.bind(null, p.id)}>
                      <button
                        type="submit"
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: '#38C7CA' }}
                      >
                        Activate
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
