-- ─────────────────────────────────────────────────────────
-- 067_unmet_booking_searches
--
-- When a customer's search finds no Tidy Pros, the search
-- (where, when, and what it needed) is saved here and
-- kennedicoats@tydioapp.com is emailed the booking details,
-- once per booking draft. When a Tidy Pro finishes every
-- onboarding step and can take bookings, the open searches
-- near them are checked against them, and each customer
-- they can serve is sent their profile. See
-- lib/unmetBookingSearches.ts.
--
-- One open row per draft: searching again with no results
-- updates that row with the latest details. A row closes when
--   cleaner_available  the customer was sent a Tidy Pro
--                      (notified_tidy_pro_id)
--   found_in_search    a later search of theirs found someone
--   draft_removed      they booked, or deleted the draft
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS unmet_booking_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Kept after the draft is gone, as a record of demand we couldn't meet.
  draft_id uuid REFERENCES booking_drafts(id) ON DELETE SET NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  location_label text,
  scheduled_date date,
  scheduled_time text,
  -- The customer's browser zone when they searched, for telling when the time has passed.
  time_zone text NOT NULL DEFAULT 'America/New_York',
  duration_minutes integer NOT NULL,
  required_services text[] NOT NULL DEFAULT '{}',
  task_names text[] NOT NULL DEFAULT '{}',
  estimated_price numeric(10, 2),
  search_count integer NOT NULL DEFAULT 1,
  admin_notified_at timestamptz,
  customer_notified_at timestamptz,
  notified_tidy_pro_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_reason text CHECK (closed_reason IN ('cleaner_available', 'found_in_search', 'draft_removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unmet_booking_searches_open_draft_idx
  ON unmet_booking_searches (draft_id)
  WHERE closed_at IS NULL;

-- Finding open searches near a Tidy Pro.
CREATE INDEX IF NOT EXISTS unmet_booking_searches_open_location_idx
  ON unmet_booking_searches (latitude, longitude)
  WHERE closed_at IS NULL;

ALTER TABLE unmet_booking_searches ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
