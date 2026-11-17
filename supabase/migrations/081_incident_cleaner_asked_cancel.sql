-- 081_incident_cleaner_asked_cancel
--
-- A customer canceling an accepted booking because "The cleaner asked me to cancel" is
-- escalated to the admin instead of refunded on the spot: it becomes a booking incident
-- (like a no-show), settled from /admin/incidents. See lib/bookingIncidents.ts.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_incident_type_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_incident_type_check
  CHECK (incident_type IN ('no_access', 'cleaner_no_show', 'cleaner_asked_cancel'));
