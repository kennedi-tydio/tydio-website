-- ─────────────────────────────────────────────────────────
-- 016_profile_photos
--
-- Public storage bucket for Tidy Pro profile photos, which
-- customers see on the cleaner profile and matching screens.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;
