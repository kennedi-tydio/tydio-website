// A customer's bio and cleaning preferences (profiles.bio, profiles.cleaning_preferences),
// shown to the Tidy Pros they book. Limits match the checks in migration 095.
export const CUSTOMER_BIO_MAX_LENGTH = 500
export const CUSTOMER_PREFERENCES_MAX_LENGTH = 1000

export function validateCustomerAbout(bio: string, preferences: string): string | null {
  if (bio.trim().length > CUSTOMER_BIO_MAX_LENGTH) return `Please keep your bio under ${CUSTOMER_BIO_MAX_LENGTH} characters.`
  if (preferences.trim().length > CUSTOMER_PREFERENCES_MAX_LENGTH) {
    return `Please keep your preferences under ${CUSTOMER_PREFERENCES_MAX_LENGTH} characters.`
  }
  return null
}
