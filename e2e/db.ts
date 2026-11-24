import crypto from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { testState } from './helpers'

// Direct database access for setting up browser tests. Only ever touches the
// Stripe test-mode accounts' rows (scripts/stripe-test-mode). The database is
// shared with the live site, so nothing here may reach a real account.
loadEnvConfig(process.cwd())

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local')
  return createClient(url, key, { auth: { persistSession: false } })
}

export type SeedTask = { name: string; room: string }

// Starts the test customer over: no booking draft (so no cleaning in progress),
// and Home's Tidy Tasks set to `tasks`.
export async function resetCustomerDraft(tasks: SeedTask[] = []) {
  const { customerId } = testState()
  const client = db()
  const del = await client.from('booking_drafts').delete().eq('customer_user_id', customerId)
  if (del.error) throw del.error
  if (tasks.length === 0) return
  const task_list = tasks.map((t) => ({
    id: crypto.randomUUID(),
    name: t.name,
    notes: '',
    room: t.room,
    dirtLevel: 'standard',
    unusual: [],
    completed: false,
    tier: 'Quick',
    estimatedMinutes: 12,
  }))
  const ins = await client.from('booking_drafts').insert({ customer_user_id: customerId, task_list, last_step_reached: 1 })
  if (ins.error) throw ins.error
}

// Clears the directions saved on the test customer's addresses.
export async function clearSavedDirections() {
  const { customerId } = testState()
  const { error } = await db().from('user_addresses').update({ entry_instructions: null }).eq('user_id', customerId)
  if (error) throw error
}

export async function savedDirections(): Promise<string | null> {
  const { customerId } = testState()
  const { data, error } = await db()
    .from('user_addresses')
    .select('entry_instructions')
    .eq('user_id', customerId)
    .eq('label', 'Stripe Test Home')
    .maybeSingle()
  if (error) throw error
  return (data?.entry_instructions as string | null) ?? null
}

// The test customer's latest draft: its Tidy Task names and whether a cleaning is on it.
export async function latestDraft(): Promise<{ tasks: string[]; hasCleaning: boolean } | null> {
  const { customerId } = testState()
  const { data, error } = await db()
    .from('booking_drafts')
    .select('task_list, full_service')
    .eq('customer_user_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { tasks: ((data.task_list as { name: string }[] | null) ?? []).map((t) => t.name), hasCleaning: !!data.full_service }
}
