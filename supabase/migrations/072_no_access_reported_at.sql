-- ─────────────────────────────────────────────────────────
-- 072_no_access_reported_at
--
-- bookings.no_access_reported_at: when the Tidy Pro last pressed
--   "Unable to access location". The no-access countdown runs
--   from the later of this and the scheduled start (see
--   noAccessReportableAt in lib/bookingTime.ts). The admin is
--   emailed only the first time it's set.
-- ─────────────────────────────────────────────────────────

alter table public.bookings
  add column if not exists no_access_reported_at timestamptz;
