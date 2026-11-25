import type { ReactNode } from 'react'
import Link from 'next/link'
import type { ScheduledLocation } from '@/app/book/schedule/actions'
import type { TidyTask } from '@/app/dashboard/types'
import type { PricingBreakdown } from '@/lib/pricingRules'
import { serviceAddressText } from '@/lib/bookingIncidentEmail'
import { bookingStartInstant } from '@/lib/bookingTime'
import { bookedTaskName } from '@/lib/laundry'
import { taskSpecifics } from '@/lib/taskSpecifics'
import { readSnapshot } from '@/lib/fullServiceBooking'
import { FULL_SERVICE_LABEL, priorityLabel, scopeLabel } from '@/lib/fullService'

// Everything an admin can see about one open booking, shown when its row on the
// Bookings tab is expanded: where and when, who, every task as the customer
// described it, what it costs and who gets what, and the Stripe records.

// smsPhone: a customer's separate texting number, when it differs from `phone`.
export type DetailPerson = { name: string; email: string | null; phone: string | null; smsPhone?: string | null }

export type DetailBooking = {
  id: string
  status: string | null
  decision_status: string | null
  progress_status: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  time_zone: string
  estimated_duration_minutes: number | null
  scheduled_location: unknown
  task_list: unknown
  task_description: string | null
  pricing_breakdown: unknown
  // Standard / Deep Cleaning snapshot (lib/fullServiceBooking), when booked.
  full_service?: unknown
  will_provide_supplies: boolean | null
  pets: string | null
  notes: string | null
  entry_instructions: string | null
  customer_subtotal: number | null
  total_customer_charge: number | null
  cleaner_pay: number | null
  promo_discount?: number | null
  tip: number | null
  amount_due: number | null
  payment_due_at: string | null
  payment_error: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
  stripe_transfer_id: string | null
  recurring_booking_id: string | null
  request_group_id: string | null
  auto_accepted: boolean | null
  created_at: string
  arrived_at: string | null
  no_access_photo_url: string | null
  task_photos_removed_at: string | null
}

// A task as the Tidy Pro works through it, with the photos they took.
export type DetailTask = {
  id: string
  task_name: string
  task_category: string
  // 'task', or a Standard / Deep Cleaning row (booking_tasks.kind).
  kind?: string | null
  is_completed: boolean
  completed_at: string | null
  before_photo_url: string | null
  completion_photo_url: string | null
  // An Entire home task's photos (up to 3 before and 3 after), first ones
  // included. Unset for other tasks, which have just the two columns above.
  photos?: DetailPhoto[]
}

// One of several photos: an Entire home task's, or a Standard / Deep Cleaning's
// photos of the whole cleaning.
export type DetailPhoto = { kind: string; photo_url: string }

export type DetailAddition = {
  id: string
  task_list: unknown
  amount: number
  cleaner_pay: number
  customer_charge: number
  status: string
  apply_to_series: boolean
  created_at: string
}

function money(value: number | null | undefined): string | null {
  return value == null ? null : `$${Number(value).toFixed(2)}`
}

function dateTime(iso: string | null, timeZone: string): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function startText(b: DetailBooking): string | null {
  if (!b.scheduled_date) return null
  if (!b.scheduled_time) return `${b.scheduled_date}, anytime`
  return bookingStartInstant(b.scheduled_date, b.scheduled_time, b.time_zone).toLocaleString('en-US', {
    timeZone: b.time_zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

function duration(minutes: number | null | undefined): string | null {
  if (minutes == null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h ? `${h} hr` : null, m ? `${m} min` : null].filter(Boolean).join(' ') || '0 min'
}

function stripeLink(id: string | null, path: string): ReactNode {
  if (!id) return null
  return (
    <a href={`https://dashboard.stripe.com/${path}/${id}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-brand hover:underline break-all">
      {id}
    </a>
  )
}

function tasksOf(value: unknown): TidyTask[] {
  return Array.isArray(value) ? (value as TidyTask[]).filter((t) => t && typeof t.name === 'string') : []
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '' || children === false) return null
  return (
    <div className="flex gap-3 py-1">
      <dt className="w-36 shrink-0 text-slate-400">{label}</dt>
      <dd className="min-w-0 text-slate-700 whitespace-pre-wrap break-words">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</h3>
      <dl className="text-xs">{children}</dl>
    </section>
  )
}

function Photo({ url, label, alt }: { url: string; label: string; alt: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="relative block w-28 shrink-0" title="Open full size">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" className="w-28 h-28 object-cover rounded-lg border border-slate-200 bg-slate-100" />
      <span className="absolute bottom-1 left-1 text-[10px] font-semibold text-white bg-black/60 rounded px-1.5 py-0.5">{label}</span>
    </a>
  )
}

type TaskItem = { key: string; name: string; spec: TidyTask | null; row: DetailTask | null }

// Lines up the customer's tasks (booking.task_list) with the Tidy Pro's
// checklist rows (booking_tasks), which hold the photos. A row is saved under
// bookedTaskName(task) and the task's room, in the same order, so each row
// takes the first unused task with that name and room. Anything left over on
// either side is still listed.
function pairTasks(specs: TidyTask[], rows: DetailTask[]): TaskItem[] {
  const unused = specs.map((spec, i) => ({ spec, i }))
  const items: TaskItem[] = rows.map((row) => {
    let at = unused.findIndex(({ spec }) => bookedTaskName(spec) === row.task_name && spec.room === row.task_category)
    if (at === -1) at = unused.findIndex(({ spec }) => bookedTaskName(spec) === row.task_name)
    const spec = at === -1 ? null : unused.splice(at, 1)[0].spec
    return { key: row.id, name: row.task_name, spec, row }
  })
  for (const { spec, i } of unused) items.push({ key: `spec-${spec.id ?? i}`, name: spec.name, spec, row: null })
  return items
}

// One task: what the customer asked for on the left, and the Tidy Pro's before
// (optional) and after (required to check the task off) photos beside it.
function TaskList({ items, timeZone }: { items: TaskItem[]; timeZone: string }) {
  return (
    <ol className="flex flex-col gap-2 text-xs">
      {items.map(({ key, name, spec, row }) => (
        <li key={key} className="rounded-lg bg-white border border-slate-100 px-3 py-2 flex flex-wrap gap-3 justify-between">
          <div className="min-w-0 flex-1 basis-56">
            <p className="font-semibold text-slate-800">
              {name}
              {row && (
                <span className={`ml-2 font-normal ${row.is_completed ? 'text-green-700' : 'text-slate-400'}`}>
                  {row.is_completed ? `✓ Checked off ${dateTime(row.completed_at, timeZone) ?? ''}` : 'Not checked off yet'}
                </span>
              )}
            </p>
            {spec && taskSpecifics(spec).map((line) => (
              <p key={line} className="text-slate-500">{line}</p>
            ))}
            {spec?.notes && <p className="text-slate-600 italic mt-0.5">“{spec.notes}”</p>}
          </div>
          {row?.photos?.length ? (
            <div className="flex flex-wrap gap-2">
              {[...row.photos.filter((p) => p.kind === 'before'), ...row.photos.filter((p) => p.kind === 'after')].map((p, i) => (
                <Photo key={`${p.photo_url}-${i}`} url={p.photo_url} label={p.kind === 'before' ? 'Before' : 'After'} alt={`${name}, ${p.kind}`} />
              ))}
            </div>
          ) : (
            (row?.before_photo_url || row?.completion_photo_url) && (
              <div className="flex gap-2">
                {row.before_photo_url && <Photo url={row.before_photo_url} label="Before" alt={`${name}, before`} />}
                {row.completion_photo_url && <Photo url={row.completion_photo_url} label="After" alt={`${name}, after`} />}
              </div>
            )
          )}
        </li>
      ))}
    </ol>
  )
}

export default function BookingDetails({
  booking: b,
  customer,
  tidyPro,
  bookingTasks,
  additions,
  cleaningPhotos = [],
}: {
  booking: DetailBooking
  customer: DetailPerson | undefined
  tidyPro: DetailPerson | undefined
  bookingTasks: DetailTask[]
  additions: DetailAddition[]
  // A Standard / Deep Cleaning's photos of the whole cleaning.
  cleaningPhotos?: DetailPhoto[]
}) {
  const taskProgress = { total: bookingTasks.length, done: bookingTasks.filter((t) => t.is_completed).length }
  const taskItems = pairTasks(tasksOf(b.task_list), bookingTasks)
  const breakdown = (b.pricing_breakdown ?? null) as Partial<PricingBreakdown> | null
  const total = b.total_customer_charge != null ? Number(b.total_customer_charge) : null
  const cleanerPay = b.cleaner_pay != null ? Number(b.cleaner_pay) : null
  const fullService = readSnapshot(b.full_service)

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 bg-slate-50 rounded-xl p-4">
      <Section title="When & where">
        <Field label="Start">{startText(b)}</Field>
        <Field label="Estimated length">{duration(b.estimated_duration_minutes)}</Field>
        <Field label="Service address">{serviceAddressText(b.scheduled_location as ScheduledLocation | null)}</Field>
        <Field label="Directions & entry">{b.entry_instructions}</Field>
        <Field label="Arrived">{dateTime(b.arrived_at, b.time_zone)}</Field>
        <Field label="Booked">{dateTime(b.created_at, b.time_zone)}</Field>
        <Field label="Request">{[b.decision_status, b.auto_accepted ? 'auto-accepted' : null].filter(Boolean).join(', ')}</Field>
        <Field label="Recurring">
          {b.recurring_booking_id ? (
            <Link href={`/admin/recurring#series-${b.recurring_booking_id}`} className="text-brand hover:underline">
              Yes (series {b.recurring_booking_id.slice(0, 8)})
            </Link>
          ) : null}
        </Field>
        <Field label="Request group">{b.request_group_id ? b.request_group_id.slice(0, 8) : null}</Field>
        <Field label="Booking ID">
          <span className="font-mono text-[11px]">{b.id}</span>
        </Field>
      </Section>

      <Section title="People">
        <Field label="Customer">{customer?.name}</Field>
        <Field label="Customer email">{customer?.email}</Field>
        <Field label="Customer phone">{customer?.phone}</Field>
        {customer?.smsPhone && <Field label="Customer SMS number">{customer.smsPhone}</Field>}
        <Field label="Tidy Pro">{tidyPro?.name ?? 'Not assigned'}</Field>
        <Field label="Tidy Pro email">{tidyPro?.email}</Field>
        <Field label="Tidy Pro phone">{tidyPro?.phone}</Field>
        <Field label="Supplies">
          {b.will_provide_supplies ? 'Customer provides the supplies' : 'Tidy Pro brings the supplies'}
        </Field>
        <Field label="Pets">{b.pets}</Field>
        <Field label="Notes">{b.notes}</Field>
      </Section>

      <Section title="Price">
        <Field label="Service price">{money(b.customer_subtotal)}</Field>
        <Field label="Promo discount">{b.promo_discount ? `${money(Number(b.promo_discount))} off (Tydio covers it)` : null}</Field>
        <Field label="Charged in total">{money(total)}</Field>
        <Field label="Tidy Pro gets">{money(cleanerPay)}</Field>
        <Field label="Tydio keeps">{total != null && cleanerPay != null ? `${money(total - cleanerPay)} (before Stripe fees)` : null}</Field>
        <Field label="Tip">{b.tip ? money(b.tip) : null}</Field>
        <Field label="Amount due">{b.amount_due != null ? `${money(b.amount_due)}${b.payment_due_at ? `, charged ${dateTime(b.payment_due_at, b.time_zone)}` : ''}` : null}</Field>
        <Field label="Payment error">{b.payment_error}</Field>
        {breakdown && (
          <>
            <Field label="Priced in">{breakdown.state}</Field>
            <Field label="Task time">{duration(breakdown.total_task_minutes)}</Field>
            <Field label="Base price">{money(breakdown.base_price)}</Field>
            <Field label="Cleaning type extra">{breakdown.cleaning_type_surcharge ? money(breakdown.cleaning_type_surcharge) : null}</Field>
            <Field label="Additional issues extra">{breakdown.additional_issue_surcharge ? money(breakdown.additional_issue_surcharge) : null}</Field>
            <Field label="Home size">
              {breakdown.square_footage
                ? `${breakdown.square_footage} (×${breakdown.square_footage_multiplier}, ${money(breakdown.square_footage_adjustment)})`
                : null}
            </Field>
            <Field label="Fixed-price tasks">{breakdown.flat_price_total ? money(breakdown.flat_price_total) : null}</Field>
          </>
        )}
        <Field label="Stripe payment">{stripeLink(b.stripe_payment_intent_id, 'payments')}</Field>
        <Field label="Stripe refund">{b.stripe_refund_id ? <span className="font-mono text-[11px] break-all">{b.stripe_refund_id}</span> : null}</Field>
        <Field label="Stripe transfer">{stripeLink(b.stripe_transfer_id, 'connect/transfers')}</Field>
      </Section>

      {fullService && (
        <Section title={`${FULL_SERVICE_LABEL[fullService.type]} (priced by the Tidy Pro)`}>
          <Field label="What">{scopeLabel({ ...fullService.selection, version: 1, step: 'notes' })}</Field>
          {fullService.lines.map((line) => (
            <Field key={`${line.kind}-${line.key}`} label={`${line.kind === 'addon' ? 'Add-on: ' : ''}${line.kind === 'home' ? 'Entire home' : line.label}${line.quantity > 1 ? ` × ${line.quantity}` : ''}`}>
              {`${money(line.customer_price)} (Tidy Pro's rate ${money(line.take_home)}${line.percent != null ? `, ${line.percent}%` : ''})`}
            </Field>
          ))}
          <Field label="Cleaning total">{`${money(fullService.customer_total)} (Tidy Pro's rates ${money(fullService.take_home_total)})`}</Field>
          <Field label="Home size">{`${fullService.square_footage} (×${fullService.multiplier})`}</Field>
          <Field label="Priorities">{fullService.selection.priorities.length ? fullService.selection.priorities.map(priorityLabel).join(' ') : null}</Field>
          <Field label="Estimated time">{`${duration(fullService.duration_minutes)} (${fullService.duration_source === 'ai' ? 'AI estimate' : 'formula'}; scheduling only)`}</Field>
          <Field label="Tidy Tasks">{breakdown?.task_subtotal != null ? money(breakdown.task_subtotal) : null}</Field>
        </Section>
      )}

      <section className="md:col-span-2 xl:col-span-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
          Tasks ({taskItems.length})
          {taskProgress.total > 0 && (
            <span className="normal-case font-normal text-slate-400">
              {' '}· {taskProgress.done} of {taskProgress.total} checked off
            </span>
          )}
        </h3>
        {b.task_photos_removed_at && (
          <p className="text-xs text-slate-500 mb-2">
            Task photos were removed {dateTime(b.task_photos_removed_at, b.time_zone)} (they&apos;re kept 7 days after the booking).
          </p>
        )}
        {cleaningPhotos.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-slate-600 mb-1">Photos of the cleaning</p>
            <div className="flex flex-wrap gap-2">
              {[...cleaningPhotos.filter((p) => p.kind === 'before'), ...cleaningPhotos.filter((p) => p.kind === 'after')].map((p, i) => (
                <Photo key={`${p.photo_url}-${i}`} url={p.photo_url} label={p.kind === 'before' ? 'Before' : 'After'} alt={`The cleaning, ${p.kind}`} />
              ))}
            </div>
          </div>
        )}
        {taskItems.length > 0 ? (
          <TaskList items={taskItems} timeZone={b.time_zone} />
        ) : (
          <p className="text-xs text-slate-500">{b.task_description || 'No task list saved on this booking.'}</p>
        )}
        {b.no_access_photo_url && (
          <div className="mt-3">
            <p className="text-xs text-slate-600 mb-1">Photo the Tidy Pro took when they reported they couldn&apos;t get in</p>
            <Photo url={b.no_access_photo_url} label="No access" alt="Location photo taken by the Tidy Pro" />
          </div>
        )}
      </section>


      {additions.length > 0 && (
        <section className="md:col-span-2 xl:col-span-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Tasks the customer asked to add</h3>
          <div className="flex flex-col gap-3">
            {additions.map((a) => (
              <div key={a.id}>
                <p className="text-xs text-slate-600 mb-1">
                  <span className="font-semibold capitalize">{a.status}</span> · {money(a.amount)} ({money(a.customer_charge)} with fee), Tidy Pro gets {money(a.cleaner_pay)}
                  {a.apply_to_series ? ' · every visit in the series' : ''} · asked {dateTime(a.created_at, b.time_zone)}
                </p>
                <TaskList
                  items={tasksOf(a.task_list).map((spec, i) => ({ key: `${a.id}-${spec.id ?? i}`, name: spec.name, spec, row: null }))}
                  timeZone={b.time_zone}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
