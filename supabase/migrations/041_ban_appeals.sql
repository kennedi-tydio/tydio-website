-- ─────────────────────────────────────────────────────────
-- 041_ban_appeals
--
-- A ban from /admin/users no longer deletes the account straight away. The
-- account is suspended and the person is emailed a link (appeal_token) to
-- appeal. An admin accepts the appeal (ban lifted, account reinstated) or
-- denies it (account deleted). With no appeal, the account is deleted
-- 7 days after the ban by /api/cron/ban-deletions, hourly.
--
-- account_deleted_at is set once the account is gone. Every ban before this
-- migration (all background-check denials) deleted the account at once, so
-- those are backfilled from banned_at.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE banned_users ADD COLUMN IF NOT EXISTS appeal_token text;
ALTER TABLE banned_users ADD COLUMN IF NOT EXISTS appeal_message text;
ALTER TABLE banned_users ADD COLUMN IF NOT EXISTS appeal_submitted_at timestamptz;
ALTER TABLE banned_users ADD COLUMN IF NOT EXISTS appeal_denied_at timestamptz;
ALTER TABLE banned_users ADD COLUMN IF NOT EXISTS account_deleted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS banned_users_appeal_token_idx ON banned_users (appeal_token);

UPDATE banned_users SET account_deleted_at = banned_at
WHERE appeal_token IS NULL AND account_deleted_at IS NULL;

SELECT cron.unschedule('tydio-ban-deletions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tydio-ban-deletions');
SELECT cron.schedule('tydio-ban-deletions', '23 * * * *', $$SELECT public.run_scheduled_job('/api/cron/ban-deletions')$$);

NOTIFY pgrst, 'reload schema';
