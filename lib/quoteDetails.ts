import type { TidyTask } from '@/app/dashboard/types'
import {
  FULL_SERVICE_LABEL,
  priorityLabel,
  quantityLabel,
  scopeLabel,
  selectedAddOns,
  type FullServiceSelection,
} from '@/lib/fullService'
import type { FullServiceQuote } from '@/lib/fullServicePricing'
import { TOP_TIDY_PRO_SURCHARGE, TRUST_SUPPORT_FEE, distanceSurcharge, type PricingBreakdown } from '@/lib/pricingRules'
import { recurrenceLabel, isRecurrenceFrequency } from '@/lib/recurrence'
import { squareFootageLabel } from '@/lib/squareFootage'
import { formatSearchDates, formatSearchTimes } from '@/lib/unmetBookingSearches'
import { taskSummaryLines } from '@/lib/taskSpecifics'

// Everything about the booking a customer was putting together when they saw their
// price, kept on the pricing quote (pricing_quotes.details, migration 101) so an
// abandoned cart shows the whole request: home size, Standard / Deep Cleaning with its
// rooms, add-ons and priorities, every Tidy Task as described, the schedule, notes,
// entry instructions, supplies, pets and any promo code, and every input to the price
// (state rate, home-size multiplier, each task's tier, minutes and surcharges, the Tidy
// Pro's cleaning rates, Top Tidy Pro and distance surcharges, promo, Trust & Support
// fee, card fee). Stored as display text so it reads the same however the catalog or
// rates change later.

export type QuoteDetailsTask = { id?: string; name: string; notes: string | null; lines: string[] }

export type QuoteDetails = {
  home_size: string | null
  full_service: {
    service: string
    scope: string
    add_ons: string[]
    priorities: string[]
  } | null
  tasks: QuoteDetailsTask[]
  dates: string | null
  times: string | null
  repeats: string | null
  supplies_provided: boolean | null
  pets: string | null
  notes: string | null
  entry_instructions: string | null
  promo_code: string | null
  promo_discount: number | null
  // Everything that went into the price, as label → lines (see pricingSections).
  pricing: { label: string; lines: string[] }[]
}

// A Tidy Pro offered on the list, with what made up their price.
export type QuoteOffer = {
  name: string
  isTopTidyPro: boolean
  distanceMiles: number | null
  price: number
  fullServicePrice?: number
  quotePending?: boolean
}

// The review page: the chosen Tidy Pro and the total they were shown.
export type QuoteChosen = {
  name: string
  isTopTidyPro: boolean
  distanceMiles: number | null
  servicePrice: number
  promoDiscount: number
  // The selected card's Stripe percentage, when known.
  cardPercentage?: number
  processingFee: number
  totalPrice: number
}

// What's saved on the draft itself (typed on the review page after the price was shown,
// so it's also refreshed from the draft when the cart is marked abandoned).
export type DraftExtras = {
  task_list?: unknown
  notes?: string | null
  entry_instructions?: string | null
  supplies_provided?: boolean | null
  gift_code?: string | null
}

export type QuoteDetailsInput = {
  tasks: TidyTask[]
  fullService: FullServiceSelection | null
  // The chosen Tidy Pro's price for the cleaning (review page).
  fullServiceQuote?: Pick<FullServiceQuote, 'lines' | 'multiplier' | 'customer_total'> | null
  // The Tidy Tasks' pricing (or the combined breakdown, which carries the same task fields).
  breakdown?: PricingBreakdown | null
  offers?: QuoteOffer[]
  chosen?: QuoteChosen
  squareFootage: string | null
  date: string | null
  endDate?: string | null
  time: string | null
  endTime?: string | null
  recurrence?: string | null
  pets?: string | null
  draft?: DraftExtras
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function bookedTasks(taskList: unknown): TidyTask[] {
  return Array.isArray(taskList) ? (taskList as TidyTask[]).filter((t) => t && typeof t.name === 'string' && t.completed) : []
}

export function describeTasks(tasks: TidyTask[]): QuoteDetailsTask[] {
  return tasks.map((t) => ({ ...(t.id ? { id: t.id } : {}), name: t.name || t.room || 'Task', notes: text(t.notes), lines: taskSummaryLines(t) }))
}

function draftParts(draft: DraftExtras): Partial<QuoteDetails> {
  return {
    ...(draft.notes !== undefined ? { notes: text(draft.notes) } : {}),
    ...(draft.entry_instructions !== undefined ? { entry_instructions: text(draft.entry_instructions) } : {}),
    ...(draft.supplies_provided !== undefined ? { supplies_provided: draft.supplies_provided ?? null } : {}),
    ...(draft.gift_code !== undefined ? { promo_code: text(draft.gift_code) } : {}),
  }
}

export function buildQuoteDetails(input: QuoteDetailsInput): QuoteDetails {
  const fs = input.fullService
  return {
    home_size: squareFootageLabel(input.squareFootage),
    full_service: fs
      ? {
          service: FULL_SERVICE_LABEL[fs.type],
          scope: scopeLabel(fs),
          add_ons: selectedAddOns(fs).map(({ addOn, quantity }) => `${addOn.label} (${quantityLabel(quantity, addOn.unit, addOn.unitPlural)})`),
          priorities: fs.priorities.map(priorityLabel),
        }
      : null,
    tasks: describeTasks(input.tasks),
    dates: input.date ? formatSearchDates(input.date, input.endDate) : 'Any day',
    times: input.time ? formatSearchTimes(input.time, input.endTime) : 'Anytime',
    repeats: isRecurrenceFrequency(input.recurrence) ? recurrenceLabel(input.recurrence) : null,
    supplies_provided: null,
    pets: text(input.pets),
    notes: null,
    entry_instructions: null,
    promo_code: null,
    promo_discount: input.chosen?.promoDiscount ? input.chosen.promoDiscount : null,
    pricing: pricingSections(input),
    ...(input.draft ? draftParts(input.draft) : {}),
  }
}

// The saved details with the draft's latest notes, entry instructions, supplies and
// promo code laid over them.
// The task list itself stays as quoted, so it matches the price; only each task's note
// (editable on the review page) is brought up to date.
export function refreshFromDraft(details: QuoteDetails, draft: DraftExtras): QuoteDetails {
  const notesById = new Map(bookedTasks(draft.task_list).map((t) => [t.id, text(t.notes)]))
  const tasks = details.tasks.map((t) => (t.id && notesById.has(t.id) ? { ...t, notes: notesById.get(t.id) ?? null } : t))
  // No instructions on the draft means the address's saved ones were shown; keep those.
  const entry_instructions = text(draft.entry_instructions) ?? details.entry_instructions
  return { ...details, ...draftParts(draft), tasks, entry_instructions }
}

export function readQuoteDetails(value: unknown): QuoteDetails | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const d = value as Partial<QuoteDetails>
  return {
    home_size: d.home_size ?? null,
    full_service: d.full_service ?? null,
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    dates: d.dates ?? null,
    times: d.times ?? null,
    repeats: d.repeats ?? null,
    supplies_provided: d.supplies_provided ?? null,
    pets: d.pets ?? null,
    notes: d.notes ?? null,
    entry_instructions: d.entry_instructions ?? null,
    promo_code: d.promo_code ?? null,
    promo_discount: d.promo_discount ?? null,
    pricing: Array.isArray(d.pricing) ? d.pricing : [],
  }
}

function money(value: number): string {
  return `$${Number(value).toFixed(2)}`
}

function miles(distance: number | null): string {
  return distance == null ? 'distance unknown' : `${Math.round(distance * 10) / 10} mi`
}

// The per-Tidy Pro surcharges: Top Tidy Pro, and distance from the home.
function surchargeParts(isTopTidyPro: boolean, distanceMiles: number | null): string[] {
  return [
    isTopTidyPro ? `Top Tidy Pro +${money(TOP_TIDY_PRO_SURCHARGE)}` : 'Not a Top Tidy Pro +$0.00',
    `${miles(distanceMiles)} away +${money(distanceSurcharge(distanceMiles))}`,
  ]
}

function taskPricingLines(b: PricingBreakdown): string[] {
  return [
    `State rate: ${b.state} · 4-hour median ${money(b.median_four_hour_price)}`,
    `Home-size multiplier: ×${b.square_footage_multiplier} (tasks that scale with home size)`,
    ...b.task_list.map((t) =>
      [
        t.name,
        t.flat_price != null ? `flat ${money(t.flat_price)}` : `${t.tier} tier`,
        t.has_estimated_duration ? `${t.estimated_minutes} min` : null,
        t.priced_minutes != null && t.priced_minutes !== t.estimated_minutes ? `${t.priced_minutes} min charged` : null,
        t.cleaning_type_surcharge ? `cleaning type +${money(t.cleaning_type_surcharge)}` : null,
        t.additional_issue_surcharge ? `additional issues +${money(t.additional_issue_surcharge)}` : null,
        t.unusual_notes ? `(${t.unusual_notes})` : null,
        t.scales_with_home_size === false ? 'not scaled by home size' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    ),
    `Time-based ${money(b.base_price)} · cleaning type +${money(b.cleaning_type_surcharge)} · additional issues +${money(b.additional_issue_surcharge)} · home size +${money(b.square_footage_adjustment)} · flat-price tasks ${money(b.flat_price_total)}`,
    `Tidy Tasks subtotal: ${money(b.task_subtotal ?? b.total_customer_charge)}`,
  ]
}

export function pricingSections(input: QuoteDetailsInput): { label: string; lines: string[] }[] {
  const sections: { label: string; lines: string[] }[] = []
  const b = input.breakdown
  if (b && b.task_list.length > 0) sections.push({ label: 'Tidy Task pricing', lines: taskPricingLines(b) })

  const fs = input.fullService
  const quote = input.fullServiceQuote
  if (fs && quote) {
    sections.push({
      label: 'Cleaning pricing (chosen Tidy Pro’s rates)',
      lines: [
        `Home-size multiplier: ×${quote.multiplier}`,
        ...quote.lines.map((l) => {
          const label = l.kind === 'home' ? `${FULL_SERVICE_LABEL[fs.type]} base` : l.quantity > 1 ? `${l.label} × ${l.quantity}` : l.label
          return `${label}: ${money(l.customer_price)}`
        }),
        `Cleaning subtotal: ${money(quote.customer_total)}`,
      ],
    })
  }

  if (input.offers && input.offers.length > 0) {
    sections.push({
      label: 'Tidy Pros offered',
      lines: input.offers.map((o) =>
        [
          `${o.name}: ${money(o.price)}`,
          o.fullServicePrice != null ? `cleaning ${money(o.fullServicePrice)}` : null,
          ...surchargeParts(o.isTopTidyPro, o.distanceMiles),
          o.quotePending ? 'plus tasks they’ll quote' : null,
        ]
          .filter(Boolean)
          .join(' · ')
      ),
    })
  }

  const c = input.chosen
  if (c) {
    const taskSubtotal = b ? (b.task_subtotal ?? (quote ? null : b.total_customer_charge)) : null
    const rate = c.cardPercentage != null ? ` (${Math.round(c.cardPercentage * 10000) / 100}% + 30¢ card rate)` : ''
    sections.push({
      label: `Price with ${c.name}`,
      lines: [
        taskSubtotal != null && taskSubtotal > 0 ? `Tidy Tasks ${money(taskSubtotal)}` : null,
        quote ? `Cleaning ${money(quote.customer_total)}` : null,
        ...surchargeParts(c.isTopTidyPro, c.distanceMiles),
        `Service price: ${money(c.servicePrice)}`,
        c.promoDiscount ? `Promo discount −${money(c.promoDiscount)}` : null,
        `Trust & Support fee ${money(TRUST_SUPPORT_FEE)}`,
        `Card processing fee ${money(c.processingFee)}${rate}`,
        `Total shown: ${money(c.totalPrice)}`,
      ].filter((l): l is string => !!l),
    })
  }
  return sections
}

// One task as a single line: "Dust shelves — “the tall ones” · Room: Kitchen · Mess level: …".
export function taskLine(task: QuoteDetailsTask): string {
  return [task.notes ? `${task.name} — “${task.notes}”` : task.name, ...task.lines].join(' · ')
}

// Label → lines, in reading order, for the email and the admin page. Rows with nothing
// to show are left out.
export function quoteDetailRows(details: QuoteDetails): [string, string[]][] {
  const rows: [string, string[]][] = []
  const add = (label: string, lines: (string | null | undefined)[]) => {
    const kept = lines.filter((l): l is string => !!l)
    if (kept.length > 0) rows.push([label, kept])
  }
  const fs = details.full_service
  add('Home size', [details.home_size])
  if (fs) {
    add('Cleaning', [`${fs.service} · ${fs.scope}`])
    add('Add-ons', fs.add_ons.length ? fs.add_ons : ['None'])
    add('Priorities', fs.priorities)
  }
  add('Tidy Tasks', details.tasks.map(taskLine))
  add('Dates', [details.dates])
  add('Times', [details.times])
  add('Repeats', [details.repeats])
  add('Supplies', [
    details.supplies_provided == null ? null : details.supplies_provided ? 'Customer provides the supplies' : 'Tidy Pro brings the supplies',
  ])
  add('Pets', [details.pets])
  add('Notes', [details.notes])
  add('Entry instructions', [details.entry_instructions])
  add('Promo code', [details.promo_code ? `${details.promo_code}${details.promo_discount ? ` (−${money(details.promo_discount)})` : ''}` : null])
  for (const section of details.pricing) add(section.label, section.lines)
  return rows
}
