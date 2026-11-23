import type { Metadata } from 'next'
import { loadWizardDraft } from '@/lib/fullServiceDraft'
import NotesStep from './NotesStep'

export const metadata: Metadata = { title: 'Notes for Your Tidy Pro — Tydio' }

export default async function FullServiceNotesPage() {
  const { draftId, selection, notes } = await loadWizardDraft('notes')
  return <NotesStep draftId={draftId} selection={selection} initialNotes={notes} />
}
