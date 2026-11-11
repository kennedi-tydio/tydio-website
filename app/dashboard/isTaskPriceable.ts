import { tierFromEstimatedMinutes } from '@/lib/pricingRules'
import { entireHomeTier, isEntireHomeRoom } from '@/lib/entireHome'
import {
  isLaundromatPartialCycle,
  isLaundryService,
  isValidBasketCount,
  isValidIronItemCount,
  machineLoadsFor,
  needsMachineLoads,
} from '@/lib/laundry'
import type { TidyTask } from './types'

// Pure, dependency-free check — deliberately kept out of taskPricing.ts,
// which pulls in the AI estimator (and therefore the `openai` SDK) for its
// server-only repair path. This file needs to stay safe to import from
// client components like DashboardHome.tsx: importing anything that touches
// `openai` from client code crashes the moment the module loads, since the
// OpenAI client construction throws immediately without a server-side
// OPENAI_API_KEY in scope.
export function isTaskPriceable(task: TidyTask): boolean {
  if (task.laundryService === 'iron') return isValidIronItemCount(task.ironItems)
  if (task.laundryService) {
    return (
      isLaundryService(task.laundryService) &&
      isValidBasketCount(task.laundryBaskets) &&
      // Laundromat trips are full wash & dry cycles only.
      !isLaundromatPartialCycle(task) &&
      (!needsMachineLoads(task.laundryService) || machineLoadsFor(task) != null)
    )
  }
  if (task.laundryLoads) return true
  if (typeof task.hasDishwasher === 'boolean') return true
  if (isEntireHomeRoom(task.room)) return entireHomeTier(task.name) != null
  // A pet task's photos were deleted (7 days after upload, unbooked): it
  // needs re-adding with fresh photos so they can be checked again.
  if (task.pet && (task.pet.photos ?? []).length === 0) return false
  return (task.tier ?? tierFromEstimatedMinutes(task.estimatedMinutes ?? -1)) != null
}
