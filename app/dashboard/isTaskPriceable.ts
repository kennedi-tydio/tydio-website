import { tierFromEstimatedMinutes } from '@/lib/pricingRules'
import type { TidyTask } from './types'

// Pure, dependency-free check — deliberately kept out of taskPricing.ts,
// which pulls in the AI estimator (and therefore the `openai` SDK) for its
// server-only repair path. This file needs to stay safe to import from
// client components like DashboardHome.tsx: importing anything that touches
// `openai` from client code crashes the moment the module loads, since the
// OpenAI client construction throws immediately without a server-side
// OPENAI_API_KEY in scope.
export function isTaskPriceable(task: TidyTask): boolean {
  if (task.laundryLoads) return true
  if (typeof task.hasDishwasher === 'boolean') return true
  return (task.tier ?? tierFromEstimatedMinutes(task.estimatedMinutes ?? -1)) != null
}
