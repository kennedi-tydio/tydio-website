-- ─────────────────────────────────────────────────────────
-- 041_booking_incidents
--
-- A booking that couldn't happen because the cleaner couldn't get in
-- ("Customer unavailable — no access") or never showed up. Either side
-- reports it from the app, which cancels the booking without moving
-- any money; the admin then settles it from /admin/incidents with a
-- full, half, or no refund.
--
-- arrived_at is when the cleaner tapped "arrived", since the no-access
-- wait runs from the later of that and the start time.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS incident_type text CHECK (incident_type IN ('no_access', 'cleaner_no_show'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS incident_reported_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS incident_resolved_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS incident_refund_level text CHECK (incident_refund_level IN ('full', 'half', 'none'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS incident_note text;

CREATE INDEX IF NOT EXISTS bookings_incident_reported_at_idx ON bookings (incident_reported_at DESC) WHERE incident_type IS NOT NULL;

NOTIFY pgrst, 'reload schema';
