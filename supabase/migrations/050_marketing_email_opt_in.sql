-- ─────────────────────────────────────────────────────────
-- 050_marketing_email_opt_in
--
-- When the person ticked "Email me Tydio news and offers" at
-- signup. Null means they never opted in. Contacts are only added
-- to the Brevo marketing lists (Customers / Tidy Pros) when this
-- is set; unsubscribes after that are handled by Brevo itself.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz;

NOTIFY pgrst, 'reload schema';
