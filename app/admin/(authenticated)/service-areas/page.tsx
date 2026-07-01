import { createAdminClient } from '@/lib/supabase/admin'
import { activateAreaAction, pauseAreaAction, deleteZipCodeAction } from '../../actions'
import CreateAreaForm from './CreateAreaForm'
import AddZipForm from './AddZipForm'

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  beta_open: { label: 'Active', color: '#22c55e' },
  waitlist_only: { label: 'Waitlist Only', color: '#f59e0b' },
  paused_recruiting_cleaners: { label: 'Paused', color: '#64748b' },
  closed: { label: 'Closed', color: '#ef4444' },
}

export default async function ServiceAreasPage() {
  const admin = createAdminClient()

  const [{ data: areas }, { data: allZips }, { data: profiles }] = await Promise.all([
    admin.from('service_areas').select('*').order('created_at', { ascending: false }),
    admin.from('service_area_zip_codes').select('*').order('zip_code'),
    admin.from('profiles').select('zip_code, booking_access_status').eq('role', 'USER'),
  ])

  const areasWithData = (areas ?? []).map(area => {
    const zips = (allZips ?? []).filter(z => z.service_area_id === area.id)
    const zipSet = new Set(zips.map(z => z.zip_code))
    const areaUsers = (profiles ?? []).filter(p => p.zip_code && zipSet.has(p.zip_code))
    return {
      ...area,
      zips,
      waitlistedCount: areaUsers.filter(u => u.booking_access_status === 'waitlisted').length,
      bookingAllowedCount: areaUsers.filter(u => u.booking_access_status === 'booking_allowed').length,
    }
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Service Areas</h1>

      {/* Create area */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-6">
        <h2 className="font-semibold text-slate-900 text-sm mb-4">New Service Area</h2>
        <CreateAreaForm />
      </div>

      {/* Areas list */}
      {areasWithData.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
          <p className="text-slate-400 text-sm">No service areas yet. Create one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {areasWithData.map(area => {
            const info = STATUS_INFO[area.status] ?? { label: area.status, color: '#64748b' }
            return (
              <div key={area.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{area.name}</h3>
                    {area.city && (
                      <p className="text-xs text-slate-400 mt-0.5">{area.city}, {area.state}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ color: info.color, backgroundColor: `${info.color}1a` }}
                    >
                      {info.label}
                    </span>
                    {area.status !== 'beta_open' ? (
                      <form action={activateAreaAction.bind(null, area.id)}>
                        <button
                          type="submit"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
                          style={{ backgroundColor: '#38C7CA' }}
                        >
                          Activate + Send Emails
                        </button>
                      </form>
                    ) : (
                      <form action={pauseAreaAction.bind(null, area.id)}>
                        <button
                          type="submit"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                          Pause
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* User counts */}
                <div className="flex gap-6 mb-4">
                  <div>
                    <p className="text-xl font-bold" style={{ color: '#f59e0b' }}>
                      {area.waitlistedCount}
                    </p>
                    <p className="text-xs text-slate-400">Waitlisted</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold" style={{ color: '#38C7CA' }}>
                      {area.bookingAllowedCount}
                    </p>
                    <p className="text-xs text-slate-400">Booking Allowed</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-slate-700">{area.zips.length}</p>
                    <p className="text-xs text-slate-400">ZIP Codes</p>
                  </div>
                </div>

                {/* ZIP chips */}
                {area.zips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {area.zips.map(zip => (
                      <div
                        key={zip.id}
                        className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-mono text-slate-700"
                      >
                        {zip.zip_code}
                        <form action={deleteZipCodeAction.bind(null, zip.id)} className="inline">
                          <button
                            type="submit"
                            className="text-slate-300 hover:text-red-500 transition-colors leading-none"
                            aria-label={`Remove ${zip.zip_code}`}
                          >
                            ×
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add ZIP */}
                <AddZipForm serviceAreaId={area.id} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
