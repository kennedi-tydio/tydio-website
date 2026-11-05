// Keeps the Brevo marketing lists in step with Tydio accounts. Only people who
// ticked the marketing box at signup are added (profiles.marketing_opt_in_at);
// unsubscribes are handled by Brevo's own unsubscribe link.
//
// Callers treat failures as best-effort: catch and log, never block the signup,
// verification, or deletion they're part of.

const BREVO_CONTACTS_URL = 'https://api.brevo.com/v3/contacts'

type Role = 'USER' | 'TIDYPRO' | 'ADMIN'

function listIdFor(role: Role): number | null {
  const raw =
    role === 'TIDYPRO' ? process.env.BREVO_TIDYPROS_LIST_ID
    : role === 'USER' ? process.env.BREVO_CUSTOMERS_LIST_ID
    : undefined
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

function brevoHeaders(): Record<string, string> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY is not set')
  return { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' }
}

async function brevoError(res: Response): Promise<Error> {
  const body = await res.text().catch(() => '')
  return new Error(`Brevo ${res.status}: ${body}`)
}

export async function addMarketingContact(contact: {
  email: string
  firstName: string
  lastName: string
  role: Role
}): Promise<void> {
  const listId = listIdFor(contact.role)
  if (!listId) return

  const res = await fetch(BREVO_CONTACTS_URL, {
    method: 'POST',
    headers: brevoHeaders(),
    body: JSON.stringify({
      email: contact.email,
      attributes: { FIRSTNAME: contact.firstName, LASTNAME: contact.lastName },
      listIds: [listId],
      // Someone with both a customer and a Tidy Pro account is one Brevo
      // contact on both lists; this adds the list instead of failing.
      updateEnabled: true,
    }),
  })
  if (!res.ok) throw await brevoError(res)
}

// Takes the email off the list for this account's role only, so deleting a
// customer account leaves the same person's Tidy Pro subscription alone.
export async function removeMarketingContact(email: string, role: Role): Promise<void> {
  const listId = listIdFor(role)
  if (!listId) return

  const res = await fetch(`${BREVO_CONTACTS_URL}/lists/${listId}/contacts/remove`, {
    method: 'POST',
    headers: brevoHeaders(),
    body: JSON.stringify({ emails: [email] }),
  })
  // 400 here means the email wasn't on the list (never opted in): nothing to remove.
  if (!res.ok && res.status !== 400 && res.status !== 404) throw await brevoError(res)
}

// Removes the contact from Brevo entirely, for when the person has no Tydio
// account left at all.
export async function deleteMarketingContact(email: string): Promise<void> {
  const res = await fetch(`${BREVO_CONTACTS_URL}/${encodeURIComponent(email)}?identifierType=email_id`, {
    method: 'DELETE',
    headers: brevoHeaders(),
  })
  if (!res.ok && res.status !== 404) throw await brevoError(res)
}
