import type { Metadata } from 'next'
import { loadWizardDraft } from '@/lib/fullServiceDraft'
import PrioritiesStep from './PrioritiesStep'

export const metadata: Metadata = { title: 'Cleaning Priorities — Tydio' }

export default async function FullServicePrioritiesPage() {
  const { selection } = await loadWizardDraft('priorities')
  return <PrioritiesStep selection={selection} />
}
