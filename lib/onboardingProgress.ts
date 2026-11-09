import { backgroundCheckStage } from '@/lib/backgroundCheck'
import { hasPaidFee } from '@/lib/backgroundCheckFee'
import { missingOnboardingSteps } from '@/lib/cleanerOnboarding'

// Where a Tidy Pro is in getting from signup to bookable, as the admin Users page shows it:
//
//   waitlisted → (admin takes them off the waitlist) → onboarding
//              → onboarding · background check paid → approved
//
// The steps follow the cleaner's onboarding flow: sign the agreement, pay for and complete
// the background check, then build their profile (missingOnboardingSteps).

type BackgroundCheckFields = {
  status: string
  requested_at: string | null
  link_sent_at: string | null
  submitted_at: string | null
  fee_paid_at: string | null
  fee_refunded_at: string | null
}

export type TidyProProgress = {
  bookingAccessStatus: string | null
  cleanerStatus: string | null
  hasSignedAgreement: boolean
  backgroundCheck: BackgroundCheckFields | null | undefined
  profile: Parameters<typeof missingOnboardingSteps>[0] | null | undefined
}

export function isOnWaitlist(bookingAccessStatus: string | null): boolean {
  return bookingAccessStatus === 'waitlisted' || bookingAccessStatus === 'denied'
}

// Approved and paused cleaners are past onboarding (paused is an admin hold), so this is
// only the label for someone still working through it.
export function onboardingStatusLabel(progress: Pick<TidyProProgress, 'bookingAccessStatus' | 'backgroundCheck'>): string {
  if (isOnWaitlist(progress.bookingAccessStatus)) return progress.bookingAccessStatus === 'denied' ? 'denied' : 'waitlisted'
  return hasPaidFee(progress.backgroundCheck) ? 'onboarding · background check paid' : 'onboarding'
}

// Steps still to do, in the order the cleaner meets them. "(Tydio)" marks the ones waiting
// on the admin rather than the cleaner.
export function remainingOnboardingActions(progress: TidyProProgress): string[] {
  if (isOnWaitlist(progress.bookingAccessStatus)) return ['Take off the waitlist (Tydio)']

  const actions: string[] = []
  const approved = progress.cleanerStatus === 'approved'

  if (!progress.hasSignedAgreement) actions.push('Sign the contractor agreement')

  // An admin can approve a cleaner directly, without a background check on file.
  if (!approved) {
    const check = progress.backgroundCheck
    switch (backgroundCheckStage(check)) {
      case 'not_started':
        actions.push('Pay for the background check')
        break
      case 'needs_link':
        // Paid, but the fee was refunded since: they have to pay again to continue.
        if (check?.fee_paid_at && check.fee_refunded_at) actions.push('Pay for the background check')
        else actions.push('Send the background check form (Tydio)')
        break
      case 'link_sent':
        actions.push('Fill out the background check form')
        break
      case 'pending':
        actions.push('Record the background check result (Tydio)')
        break
      case 'failed':
        actions.push('Background check not passed')
        break
      case 'passed':
        if (progress.cleanerStatus !== 'paused') actions.push('Approve (Tydio)')
        break
    }
  }

  if (progress.profile) {
    for (const step of missingOnboardingSteps(progress.profile)) actions.push(adminStepLabel(step.label))
  }
  return actions
}

// missingOnboardingSteps talks to the cleaner ("Write your bio"); the admin list reads
// better without the "your".
function adminStepLabel(label: string): string {
  return label.replace(/\byour\b /i, '')
}
