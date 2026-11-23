import type { Metadata } from 'next'
import { loadWizardDraft } from '@/lib/fullServiceDraft'
import TasksStep from './TasksStep'

export const metadata: Metadata = { title: 'Add Tidy Tasks — Tydio' }

export default async function FullServiceTasksPage() {
  const { draftId, selection, tasks, customRooms } = await loadWizardDraft('tasks')
  return <TasksStep draftId={draftId} selection={selection} initialTasks={tasks} savedRooms={customRooms} />
}
