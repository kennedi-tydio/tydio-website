'use client'

import { useRouter } from '@/app/components/NavigationSpinner'
import type { TidyTask } from '@/app/dashboard/types'
import UpdatedBookingRequestCard from '@/app/components/UpdatedBookingRequestCard'
import { acceptTaskAdditionAction, declineTaskAdditionAction } from './actions'

export type TaskAdditionRequest = {
  id: string
  tasks: TidyTask[]
  extraPay: number
  newDurationMinutes: number
  // A recurring visit: the customer wants these on every future visit too.
  applyToSeries: boolean
}

// The Tidy Pro's side of a customer's added-tasks request: the shared updated booking
// request, with Accept and Decline. The customer sees the same card with Cancel.
export default function TaskAdditionRequestCard({
  request,
  customerFirstName,
  photoUrls,
  currentTasks,
  currentPayout,
  currentDurationMinutes,
  scheduledDate,
  scheduledTime,
}: {
  request: TaskAdditionRequest
  customerFirstName: string
  photoUrls: Record<string, string>
  currentTasks: TidyTask[]
  currentPayout: number
  currentDurationMinutes: number
  scheduledDate: string | null
  scheduledTime: string | null
}) {
  const router = useRouter()

  async function after(result: { success: true } | { error: string }) {
    if ('success' in result) router.refresh()
    return result
  }

  return (
    <UpdatedBookingRequestCard
      viewer="tidypro"
      otherFirstName={customerFirstName}
      request={{ tasks: request.tasks, extraAmount: request.extraPay, newDurationMinutes: request.newDurationMinutes, applyToSeries: request.applyToSeries }}
      photoUrls={photoUrls}
      currentTasks={currentTasks}
      currentAmount={currentPayout}
      currentDurationMinutes={currentDurationMinutes}
      scheduledDate={scheduledDate}
      scheduledTime={scheduledTime}
      onAccept={async () => after(await acceptTaskAdditionAction(request.id))}
      onDecline={async () => after(await declineTaskAdditionAction(request.id))}
    />
  )
}
