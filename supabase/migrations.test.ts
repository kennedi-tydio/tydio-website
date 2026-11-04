import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 038 locked the public API down: RLS on everywhere, nothing granted to anon or
// authenticated. The app only talks to the database as the service role, which
// bypasses RLS, so no later migration ever needs to loosen this.
const dir = join(__dirname, 'migrations')
const laterMigrations = readdirSync(dir).filter(f => f.endsWith('.sql') && Number(f.slice(0, 3)) >= 38)

describe('migrations after 038', () => {
  it.each(laterMigrations)('%s keeps the public API locked down', file => {
    const sql = readFileSync(join(dir, file), 'utf8')
    expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i)
    expect(sql).not.toMatch(/CREATE\s+POLICY/i)
    expect(sql).not.toMatch(/GRANT\s+[^;]*\bTO\s+[^;]*\b(anon|authenticated|PUBLIC)\b/i)
  })
})
