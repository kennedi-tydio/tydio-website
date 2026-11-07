import { describe, expect, it } from 'vitest'
import { parseAdminPushForm, pickRecipients, type PushRecipient } from './adminPush'

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    for (const value of Array.isArray(v) ? v : [v]) fd.append(k, value)
  }
  return fd
}

const recipient = (id: string, role: PushRecipient['role']): PushRecipient => ({
  id,
  role,
  email: `${id}@example.com`,
  firstName: null,
  lastName: null,
  devices: 1,
  subscribedAt: '2026-01-01T00:00:00Z',
})

describe('parseAdminPushForm', () => {
  it('accepts a valid broadcast and defaults the link to /', () => {
    expect(parseAdminPushForm(form({ audience: 'all', title: ' Tydio ', body: ' Hi ' }))).toEqual({
      audience: 'all',
      selectedIds: [],
      title: 'Tydio',
      body: 'Hi',
      url: '/',
    })
  })

  it('collects every selected id', () => {
    const result = parseAdminPushForm(form({ audience: 'selected', ids: ['a', 'b'], title: 'T', body: 'B' }))
    expect(result).toMatchObject({ selectedIds: ['a', 'b'] })
  })

  it.each([
    [{ audience: 'nope', title: 'T', body: 'B' }, 'Choose who to send to.'],
    [{ audience: 'all', title: '', body: 'B' }, 'Subject is required.'],
    [{ audience: 'all', title: 'T', body: '' }, 'Body is required.'],
    [{ audience: 'all', title: 'x'.repeat(61), body: 'B' }, 'Subject must be 60 characters or fewer.'],
    [{ audience: 'all', title: 'T', body: 'x'.repeat(201) }, 'Body must be 200 characters or fewer.'],
    [{ audience: 'all', title: 'T', body: 'B', url: 'https://evil.example' }, 'Link must be a path on the site, like /pro.'],
    [{ audience: 'all', title: 'T', body: 'B', url: '//evil.example' }, 'Link must be a path on the site, like /pro.'],
    [{ audience: 'selected', title: 'T', body: 'B' }, 'Select at least one person.'],
  ])('rejects %j', (fields, error) => {
    expect(parseAdminPushForm(form(fields))).toEqual({ error })
  })
})

describe('pickRecipients', () => {
  const all = [recipient('c1', 'USER'), recipient('p1', 'TIDYPRO'), recipient('a1', 'ADMIN')]

  it('sends "everyone" to customers and pros but never admins', () => {
    expect(pickRecipients(all, 'all', []).map((r) => r.id)).toEqual(['c1', 'p1'])
  })

  it('filters by role', () => {
    expect(pickRecipients(all, 'customers', []).map((r) => r.id)).toEqual(['c1'])
    expect(pickRecipients(all, 'pros', []).map((r) => r.id)).toEqual(['p1'])
  })

  it('only sends to selected ids that are actually subscribed', () => {
    expect(pickRecipients(all, 'selected', ['p1', 'unknown']).map((r) => r.id)).toEqual(['p1'])
  })
})
