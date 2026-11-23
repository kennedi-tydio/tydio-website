import type { Metadata } from 'next'
import { loadWizardDraft } from '@/lib/fullServiceDraft'
import ScopeStep from './ScopeStep'

export const metadata: Metadata = { title: 'Choose Rooms — Tydio' }

export default async function FullServiceScopePage() {
  const { selection } = await loadWizardDraft('scope')
  return <ScopeStep selection={selection} />
}
