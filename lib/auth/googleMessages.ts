// Kept apart from google.ts so the browser-side login form can import it.
// Messages for /login?google_error=<code>.
export const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled.',
  expired: 'Google sign-in took too long. Please try again.',
  exchange_failed: "We couldn't reach Google. Please try again.",
  invalid_token: "We couldn't confirm your Google sign-in. Please try again.",
  email_unverified: 'Your Google account email isn’t verified, so we can’t use it to sign in.',
  linked_elsewhere: 'That account is already connected to a different Google account. Sign in with your password instead.',
  unavailable: 'Google sign-in isn’t available right now. Please sign in with your password.',
}
