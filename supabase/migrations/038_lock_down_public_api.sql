-- ─────────────────────────────────────────────────────────
-- 038_lock_down_public_api
--
-- The anon key is public (NEXT_PUBLIC_SUPABASE_ANON_KEY), so anything
-- the anon/authenticated roles can reach through Supabase's REST API is
-- reachable by anyone. With RLS off on profiles, password_reset_tokens,
-- email_verification_tokens and others, that meant password hashes and
-- reset tokens were readable from the browser.
--
-- The app never uses those roles: auth is our own JWT (lib/auth/session.ts)
-- and every query goes through the service role (lib/supabase/admin.ts),
-- which has BYPASSRLS. So the right posture is deny-all for anon and
-- authenticated:
--   * drop the old Supabase-Auth-era policies (auth.uid()/auth.jwt() based,
--     several of them USING (true) or WITH CHECK (true) for anon)
--   * enable RLS on every table, with no policies
--   * revoke table and function privileges from anon/authenticated, now and
--     for objects created later, so a new table without RLS isn't exposed.
--     Triggers and pg_cron are unaffected (EXECUTE isn't checked when a
--     trigger fires; cron runs as postgres).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;

  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
