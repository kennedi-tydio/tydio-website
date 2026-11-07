/* eslint-disable @typescript-eslint/no-explicit-any -- test-only chainable Supabase query mock */
import { describe, expect, it } from 'vitest'
import { resolveGoogleSignIn } from './googleAccount'

type Row = Record<string, any>

// A tiny in-memory stand-in for the few Supabase queries resolveGoogleSignIn makes.
function fakeAdmin(tables: { profiles?: Row[]; auth_identities?: Row[]; banned_users?: Row[] }) {
  const db: Record<string, Row[]> = { profiles: [], auth_identities: [], banned_users: [], ...tables }
  const writes: { table: string; op: string; values: Row; filters: [string, string, unknown][] }[] = []

  const admin = {
    from(table: string) {
      const filters: [string, string, unknown][] = []
      let op = 'select'
      let values: Row = {}
      const rows = () =>
        db[table].filter((r) =>
          filters.every(([kind, col, v]) =>
            kind === 'eq' ? r[col] === v : kind === 'in' ? (v as unknown[]).includes(r[col]) : true,
          ),
        )
      const run = () => {
        if (op === 'insert') {
          db[table].push({ ...values })
          writes.push({ table, op, values, filters })
          return { data: null, error: null }
        }
        if (op === 'update') {
          rows().forEach((r) => Object.assign(r, values))
          writes.push({ table, op, values, filters })
          return { data: null, error: null }
        }
        return { data: rows(), error: null }
      }
      const chain: any = {
        select: () => chain,
        insert: (v: Row) => { op = 'insert'; values = v; return chain },
        update: (v: Row) => { op = 'update'; values = v; return chain },
        eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return chain },
        in: (c: string, v: unknown) => { filters.push(['in', c, v]); return chain },
        contains: () => { filters.push(['never', '', null]); return chain },
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => Promise.resolve(run()).then(resolve),
      }
      return chain
    },
  }
  return { admin: admin as any, db, writes }
}

const identity = { sub: 'g-1', email: 'pat@example.com', firstName: 'Pat', lastName: 'Lee' }

describe('resolveGoogleSignIn', () => {
  it('signs in the profile already linked to this Google account', async () => {
    const { admin } = fakeAdmin({
      profiles: [{ id: 'p1', role: 'USER', email: 'old@example.com', phone: null, banned_at: null }],
      auth_identities: [{ profile_id: 'p1', provider: 'google', provider_user_id: 'g-1' }],
    })
    expect(await resolveGoogleSignIn(admin, identity, 'USER')).toEqual({
      kind: 'signed_in',
      profile: { id: 'p1', role: 'USER', email: 'old@example.com' },
    })
  })

  it('keeps roles apart: a linked customer account does not sign in a Tidy Pro', async () => {
    const { admin } = fakeAdmin({
      profiles: [{ id: 'p1', role: 'USER', email: 'pat@example.com', phone: null, banned_at: null }],
      auth_identities: [{ profile_id: 'p1', provider: 'google', provider_user_id: 'g-1' }],
    })
    expect(await resolveGoogleSignIn(admin, identity, 'TIDYPRO')).toEqual({ kind: 'needs_signup' })
  })

  it('links a verified password account with the same email and keeps its password', async () => {
    const { admin, db } = fakeAdmin({
      profiles: [{ id: 'p1', role: 'USER', email: 'pat@example.com', phone: null, banned_at: null, email_verified_at: '2026-01-01', password_hash: 'h' }],
    })
    const out = await resolveGoogleSignIn(admin, identity, 'USER')
    expect(out.kind).toBe('signed_in')
    expect(db.auth_identities).toEqual([expect.objectContaining({ profile_id: 'p1', provider: 'google', provider_user_id: 'g-1' })])
    expect(db.profiles[0].password_hash).toBe('h')
  })

  it('verifies an unverified account and drops its password, which someone else may have set', async () => {
    const { admin, db } = fakeAdmin({
      profiles: [{ id: 'p1', role: 'USER', email: 'pat@example.com', phone: null, banned_at: null, email_verified_at: null, password_hash: 'h' }],
    })
    await resolveGoogleSignIn(admin, identity, 'USER')
    expect(db.profiles[0].password_hash).toBeNull()
    expect(db.profiles[0].email_verified_at).toEqual(expect.any(String))
  })

  it('will not swap in a second Google account', async () => {
    const { admin, db } = fakeAdmin({
      profiles: [{ id: 'p1', role: 'USER', email: 'pat@example.com', phone: null, banned_at: null, email_verified_at: 'x' }],
      auth_identities: [{ profile_id: 'p1', provider: 'google', provider_user_id: 'g-OTHER' }],
    })
    expect(await resolveGoogleSignIn(admin, identity, 'USER')).toEqual({ kind: 'linked_elsewhere' })
    expect(db.auth_identities).toHaveLength(1)
  })

  it('sends someone with no account to finish signing up', async () => {
    const { admin } = fakeAdmin({})
    expect(await resolveGoogleSignIn(admin, identity, 'USER')).toEqual({ kind: 'needs_signup' })
  })

  it('turns away a banned email and a banned profile', async () => {
    expect(await resolveGoogleSignIn(fakeAdmin({ banned_users: [{ id: 'b', email: 'pat@example.com' }] }).admin, identity, 'USER'))
      .toEqual({ kind: 'banned' })
    const { admin } = fakeAdmin({
      profiles: [{ id: 'p1', role: 'USER', email: 'pat@example.com', phone: null, banned_at: '2026-01-01' }],
      auth_identities: [{ profile_id: 'p1', provider: 'google', provider_user_id: 'g-1' }],
    })
    expect(await resolveGoogleSignIn(admin, identity, 'USER')).toEqual({ kind: 'banned' })
  })
})
