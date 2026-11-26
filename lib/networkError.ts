// A request from the page that never finished: the phone lost signal, the screen
// locked, or the customer switched apps mid-request (iPhones drop the request).
// Each browser words it differently, and none of it ever reaches the server's logs.
const NETWORK_ERROR_MESSAGES = [
  /load failed/i, // Safari (iPhone, iPad, Mac)
  /failed to fetch/i, // Chrome, Edge, Android
  /networkerror when attempting to fetch/i, // Firefox
  /network connection was lost/i, // older Safari
  /network request failed/i,
  /fetch failed/i,
]

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'TypeError' && NETWORK_ERROR_MESSAGES.some((pattern) => pattern.test(error.message))
}

export const CONNECTION_DROPPED_MESSAGE = "Your connection dropped before that went through. Check your signal and tap again."

// For a button whose server action threw instead of returning an error: shown
// beside the button, so the customer can tap again instead of losing the page.
export function actionErrorMessage(error: unknown): string {
  return isNetworkError(error) ? CONNECTION_DROPPED_MESSAGE : 'Something went wrong. Please try again.'
}
