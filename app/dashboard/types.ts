import type { Tier } from '@/lib/pricingRules'

export type DirtLevel = 'light' | 'standard' | 'heavy'

export type LaundryLoads = {
  wash: number
  dry: number
  fold: number
}

export type TidyTask = {
  id: string
  name: string
  notes: string
  room: string
  dirtLevel: DirtLevel | null
  unusual: string[]
  completed: boolean
  hasDishwasher?: boolean | null
  laundryLoads?: LaundryLoads | null
  tier?: Tier | null
  estimatedMinutes?: number | null
}
