-- ─────────────────────────────────────────────────────────
-- 037_risk_events
--
-- Creates risk_events, where a customer's "Report Tidy Pro" is
-- saved. It was defined in 001_booking_mvp but never made it into
-- the live database, so every report failed with "Could not find
-- the table 'public.risk_events'".
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,  -- customer_complaint | cleaner_no_show | chargeback | refund_requested | bank_account_changed | duplicate_cleaner_detected | suspicious_booking
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,   -- the user the event is about
  severity text NOT NULL DEFAULT 'low',                      -- low | medium | high | critical
  description text,
  metadata jsonb,                                            -- event-specific data (IP, Stripe event ID, etc.)
  resolved_at timestamptz,
  resolution_notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS risk_events_booking_id_idx ON risk_events (booking_id);
CREATE INDEX IF NOT EXISTS risk_events_user_id_idx ON risk_events (user_id);

-- Only the server (service role) reads or writes it; nothing from the browser.
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
