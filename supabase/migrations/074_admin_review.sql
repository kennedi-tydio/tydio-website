-- ─────────────────────────────────────────────────────────
-- 074_admin_review
--
-- Lets the admin check off a cancellation as dealt with and
-- keep notes on it (/admin/cancellations).
--
-- bookings.cancellation_resolved_at: when the admin marked the
--   cancellation resolved; null while it's still open.
-- bookings.cancellation_admin_note: the admin's private note.
--
-- Reports (/admin/reports) reuse risk_events.resolved_at and
-- risk_events.resolution_notes, which already exist.
-- ─────────────────────────────────────────────────────────

alter table public.bookings
  add column if not exists cancellation_resolved_at timestamptz,
  add column if not exists cancellation_admin_note text;
