import type { TidyTask } from '@/app/dashboard/types'
import { LAUNDRY_SERVICE_LABEL, LAUNDROMAT_LABEL } from '@/lib/laundry'
import { petDetailLabel } from '@/lib/petTasks'

// The specifics of one task as the customer set it up, one short line each. Shared by
// the admin's booking details and abandoned-cart records.

export const DIRT_LEVEL_LABELS: Record<string, string> = {
  light: 'Light touch-up',
  standard: 'Standard cleaning',
  heavy: 'Heavy cleaning',
}

export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null) return null
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return [h ? `${h} hr` : null, m ? `${m} min` : null].filter(Boolean).join(' ') || '0 min'
}

export function taskSpecifics(task: TidyTask): string[] {
  const lines: string[] = []
  if (task.room) lines.push(`Room: ${task.room}`)
  if (task.dirtLevel) lines.push(`Mess level: ${DIRT_LEVEL_LABELS[task.dirtLevel] ?? task.dirtLevel}`)
  if (task.laundryService) lines.push(`Laundry: ${LAUNDRY_SERVICE_LABEL[task.laundryService] ?? task.laundryService}`)
  if (task.laundryBaskets != null) lines.push(`Baskets: ${task.laundryBaskets}`)
  if (task.machineLoads != null) lines.push(`Machine loads: ${task.machineLoads}`)
  if (task.laundryLoads) {
    const loads = Object.entries(task.laundryLoads)
      .filter(([, n]) => typeof n === 'number' && n > 0)
      .map(([k, n]) => `${k} ${n}`)
    if (loads.length) lines.push(`Loads: ${loads.join(', ')}`)
  }
  if (task.ironItems != null) lines.push(`Items to iron: ${task.ironItems}`)
  if (task.hasWasherDryer === false) lines.push(LAUNDROMAT_LABEL)
  if (task.hasDishwasher != null) lines.push(task.hasDishwasher ? 'Has a dishwasher' : 'No dishwasher')
  if (task.unusual?.length) lines.push(`Additional issues: ${task.unusual.join(', ')}`)
  if (task.tier) lines.push(`Tier: ${task.tier}`)
  if (task.estimatedMinutes != null) lines.push(`Estimate: ${formatMinutes(task.estimatedMinutes)}`)
  return lines
}

// taskSpecifics plus the pet-task details and quote status, for records outside the
// booking itself (where photos and the Tidy Pro's checklist aren't at hand).
export function taskSummaryLines(task: TidyTask): string[] {
  const pet = petDetailLabel(task)
  return [
    ...taskSpecifics(task),
    ...(pet ? [`Pet task: ${pet}${task.pet?.scope ? ` (${task.pet.scope})` : ''}`] : []),
    ...(task.pet?.photos?.length ? [`Photos: ${task.pet.photos.length}`] : []),
    ...(task.needsQuote ? ['Needs a quote from the Tidy Pro'] : []),
    ...(task.quotedPrice != null ? [`Tidy Pro quoted $${Number(task.quotedPrice).toFixed(2)}`] : []),
  ]
}
