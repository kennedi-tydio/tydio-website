import type { Metadata } from 'next'
import { loadWizardDraft } from '@/lib/fullServiceDraft'
import AddOnsStep from './AddOnsStep'

export const metadata: Metadata = { title: 'Cleaning Add-ons — Tydio' }

export default async function FullServiceAddOnsPage() {
  const { selection } = await loadWizardDraft('add-ons')
  return <AddOnsStep selection={selection} />
}
