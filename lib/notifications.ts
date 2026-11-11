// Per-trigger notification copy — written once here, consumed by both
// lib/sms.ts (flattens body+url into one text) and lib/push.ts (uses
// title/body directly, url goes in the push payload's `data`).

export type NotificationPayload = {
  title: string
  body: string
  url: string
}

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return `${base}${path}`
}

export function notifyNewBookingRequest(customerFirstName: string, bookingId: string): NotificationPayload {
  return {
    title: 'New booking request',
    body: `${customerFirstName} just requested a Tidy Task booking.`,
    url: siteUrl(`/pro/messages/${bookingId}`),
  }
}

export function notifyBookingAccepted(cleanerFirstName: string, bookingId: string): NotificationPayload {
  return {
    title: 'Booking confirmed',
    body: `${cleanerFirstName} accepted your booking request!`,
    url: siteUrl(`/dashboard/bookings/${bookingId}`),
  }
}

export function notifyBookingDeclined(bookingId: string): NotificationPayload {
  return {
    title: 'Booking declined',
    body: "Your Tidy Pro declined your booking. Choose up to 3 other cleaners with no new charge, or cancel your booking for a refund.",
    url: siteUrl(`/dashboard/bookings/${bookingId}/replace`),
  }
}

export function notifyAllRequestsDeclined(bookingId: string): NotificationPayload {
  return {
    title: 'Booking declined',
    body: 'The Tidy Pros you asked declined your booking. Choose up to 3 other cleaners with no new charge, or cancel your booking for a refund.',
    url: siteUrl(`/dashboard/bookings/${bookingId}/replace`),
  }
}

export function notifyRequestFilled(bookingId: string): NotificationPayload {
  return {
    title: 'Request no longer available',
    body: 'Another Tidy Pro accepted this booking first.',
    url: siteUrl(`/pro/messages/${bookingId}`),
  }
}

export function notifyReplacementsDeclined(): NotificationPayload {
  return {
    title: 'Booking canceled',
    body: 'The Tidy Pros you asked declined, so your booking has been canceled and your payment refunded, minus the nonrefundable Stripe fee. Your tasks are back on your list.',
    url: siteUrl('/dashboard'),
  }
}

export function notifyBookingCancelledConfirmation(): NotificationPayload {
  return {
    title: 'Booking canceled',
    body: 'Your booking has been canceled and your payment refunded, minus the nonrefundable Stripe fee. Your tasks are back on your list.',
    url: siteUrl('/dashboard'),
  }
}

export function notifyLateCancelConfirmation(refund: number): NotificationPayload {
  return {
    title: 'Booking canceled',
    body: `Your booking has been canceled. Because it was less than 12 hours away, $${refund.toFixed(2)} (50%) has been refunded. Your tasks are back on your list.`,
    url: siteUrl('/dashboard'),
  }
}

export function notifyCleanerCancelled(cleanerFirstName: string, bookingId: string): NotificationPayload {
  return {
    title: 'Your Tidy Pro canceled',
    body: `${cleanerFirstName} canceled your booking. Choose up to 3 other cleaners with no new charge, or cancel your booking for a refund.`,
    url: siteUrl(`/dashboard/bookings/${bookingId}/replace`),
  }
}

export function notifyCleanerCancelledRefunded(cleanerFirstName: string): NotificationPayload {
  return {
    title: 'Your Tidy Pro canceled',
    body: `${cleanerFirstName} canceled your booking less than an hour before it starts, so your payment has been refunded in full. Your tasks are back on your list.`,
    url: siteUrl('/dashboard'),
  }
}

// `refunded` is what Stripe returned, or null if it couldn't be looked up.
export function notifyAdminCancelledBooking(refund: 'full' | 'minus_fee' | 'half' | 'custom' | 'none', refunded: number | null): NotificationPayload {
  const amount = refunded != null ? `$${refunded.toFixed(2)}` : 'your payment'
  const outcome = {
    full: `${amount} has been refunded in full`,
    minus_fee: `${amount} has been refunded, minus the nonrefundable Stripe fee`,
    half: `${amount} has been refunded, half of what you paid`,
    custom: `${amount} has been refunded`,
    none: 'your payment was not refunded. We’ve emailed you the reason',
  }[refund]
  return {
    title: 'Booking canceled',
    body: `The Tydio team canceled your booking, and ${outcome}. Your tasks are back on your list.`,
    url: siteUrl('/dashboard'),
  }
}

export function notifyCustomerNoAccess(): NotificationPayload {
  return {
    title: "Your Tidy Pro couldn't get in",
    body: "Your Tidy Pro arrived but couldn't get into your home, so your booking has been canceled. Our team will review it and email you about any refund. Your tasks are back on your list.",
    url: siteUrl('/dashboard'),
  }
}

export function notifyNoShowReportedConfirmation(): NotificationPayload {
  return {
    title: 'No-show reported',
    body: "Sorry your Tidy Pro didn't arrive. Your booking has been canceled, and our team will review it and email you about your refund. Your tasks are back on your list.",
    url: siteUrl('/dashboard'),
  }
}

export function notifyNoShowReported(bookingId: string): NotificationPayload {
  return {
    title: 'No-show reported',
    body: "The customer reported that you didn't arrive for their booking, so it has been canceled. Your account is under review, and our team will email you about it.",
    url: siteUrl(`/pro/messages/${bookingId}`),
  }
}

export function notifyBookingExpired(): NotificationPayload {
  return {
    title: 'Booking canceled',
    body: 'No Tidy Pro accepted by an hour before your booking time, so it has been canceled and your payment refunded, minus the nonrefundable Stripe fee. Your tasks are back on your list.',
    url: siteUrl('/dashboard'),
  }
}

export function notifyRequestExpired(bookingId: string): NotificationPayload {
  return {
    title: 'Request expired',
    body: 'A booking request expired because it was not accepted at least an hour before its start time.',
    url: siteUrl(`/pro/messages/${bookingId}`),
  }
}

export function notifyCustomerCancelled(customerFirstName: string): NotificationPayload {
  return {
    title: 'Booking cancelled',
    body: `${customerFirstName} cancelled their booking request.`,
    url: siteUrl('/pro/messages'),
  }
}

export function notifyAdminCancelledRequest(bookingId: string): NotificationPayload {
  return {
    title: 'Booking cancelled',
    body: 'The Tydio team cancelled this booking.',
    url: siteUrl(`/pro/messages/${bookingId}`),
  }
}

export function notifyCustomerCancelledLate(customerFirstName: string, pay: number, bookingId: string): NotificationPayload {
  return {
    title: 'Booking cancelled',
    body: `${customerFirstName} cancelled less than 12 hours before the booking, so you'll still be paid $${pay.toFixed(2)}.`,
    url: siteUrl(`/pro/messages/${bookingId}`),
  }
}

export function notifyOnTheWay(cleanerFirstName: string, bookingId: string): NotificationPayload {
  return {
    title: `${cleanerFirstName} is on the way`,
    body: 'Track their progress in the app.',
    url: siteUrl(`/dashboard/bookings/${bookingId}`),
  }
}

export function notifyBookingDone(bookingId: string): NotificationPayload {
  return {
    title: 'All done!',
    body: 'Your Tidy Pro finished the job — leave them a review.',
    url: siteUrl(`/dashboard/bookings/${bookingId}`),
  }
}

export function notifyOnTheWayReminder(bookingId: string): NotificationPayload {
  return {
    title: 'Your booking has started',
    body: `Your booking's start time has arrived. If you're on the way, open Tydio, tap "I'm on the way", and follow the booking instructions.`,
    url: siteUrl(`/pro/messages/${bookingId}`),
  }
}

export function notifyStartsIn30(forRole: 'USER' | 'TIDYPRO', bookingId: string): NotificationPayload {
  return forRole === 'USER'
    ? {
        title: 'Starting soon',
        body: 'Your cleaning starts in 30 minutes.',
        url: siteUrl(`/dashboard/bookings/${bookingId}`),
      }
    : {
        title: 'Starting soon',
        body: 'Your next booking starts in 30 minutes.',
        url: siteUrl(`/pro/messages/${bookingId}`),
      }
}

// Deliberately leaves out the star rating — the Tidy Pro may not be allowed to
// see this review yet (see cleanerReviewWindow).
export function notifyNewReview(bookingId: string): NotificationPayload {
  return {
    title: 'New review',
    body: 'Your customer left you a review. Open the booking to see it.',
    url: siteUrl(`/pro/bookings/${bookingId}`),
  }
}

export function notifyNewTimeProposed(cleanerFirstName: string, bookingId: string): NotificationPayload {
  return {
    title: 'New start time suggested',
    body: `${cleanerFirstName} suggested a different start time for your booking. Approve or decline it in your messages.`,
    url: siteUrl(`/dashboard/messages/${bookingId}`),
  }
}

export function notifyTimeProposalAnswered(approved: boolean, bookingId: string): NotificationPayload {
  return {
    title: approved ? 'New start time approved' : 'New start time declined',
    body: approved
      ? 'Your customer approved the start time you suggested. The booking has been updated.'
      : 'Your customer declined the start time you suggested, so the booking keeps its original time.',
    url: siteUrl(`/pro/messages/${bookingId}`),
  }
}

export function notifyNewMessage(forRole: 'USER' | 'TIDYPRO', bookingId: string): NotificationPayload {
  return {
    title: 'New message',
    body: 'You received a new message.',
    url: siteUrl(forRole === 'USER' ? `/dashboard/messages/${bookingId}` : `/pro/messages/${bookingId}`),
  }
}

// With no link, the provider emailed the cleaner its invitation directly.
export function notifyBackgroundCheckLinkSent(link: string | null): NotificationPayload {
  return {
    title: 'Complete your background check',
    body: link
      ? 'Your Tydio background check and ID verification are ready to complete.'
      : 'Your Tydio background check is ready. Check your email for an invitation from Checkr.',
    url: link ?? siteUrl('/pro/onboarding/setup/background-check'),
  }
}

export function notifyBackgroundCheckPassed(): NotificationPayload {
  return {
    title: "You've been approved!",
    body: 'You passed your Tydio background check. Finish your availability, profile picture, bio, and payout method to start receiving bookings.',
    url: siteUrl('/pro/onboarding'),
  }
}

export function notifyInsuranceExpiringSoon(expirationLabel: string): NotificationPayload {
  return {
    title: 'Your insurance expires soon',
    body: `Your proof of insurance expires on ${expirationLabel}. Please upload your updated insurance before then to keep your Insured Cleaner badge.`,
    url: siteUrl('/pro/profile/insurance'),
  }
}

export function notifyInsuranceExpired(): NotificationPayload {
  return {
    title: 'Your insurance has expired',
    body: 'Your proof of insurance has reached its expiration date. Please upload your updated insurance to get your Insured Cleaner badge back.',
    url: siteUrl('/pro/profile/insurance'),
  }
}

export function notifyInsuranceDenied(reason: string): NotificationPayload {
  return {
    title: 'Insurance document needs attention',
    body: `Your proof of insurance wasn't approved: ${reason}`,
    url: siteUrl('/pro/profile/insurance'),
  }
}
