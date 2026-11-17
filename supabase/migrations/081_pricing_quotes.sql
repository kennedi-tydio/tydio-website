-- ─────────────────────────────────────────────────────────
-- 081_pricing_quotes
--
-- Abandoned-cart tracking. Each time a customer sees prices
-- (the list of Tidy Pros to choose from, or the booking review
-- page), what they were quoted is saved here, one row per
-- booking draft:
--   stage 'cleaners'  they saw the Tidy Pro list and its prices
--   stage 'review'    they picked one and saw the final total
-- (the furthest stage reached is kept).
--
-- Placing the booking sets booked_at. If nothing has happened
-- for a while after the last price they saw, a scheduled job
-- marks the quote abandoned (abandoned_at) and emails
-- kennedicoats@tydioapp.com the tasks and prices, once. The
-- admin's Abandoned Carts page compares booked and abandoned
-- quotes by price. See lib/pricingQuotes.ts.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pricing_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Kept after the draft is gone (booked or deleted), as the record of the quote.
  draft_id uuid REFERENCES booking_drafts(id) ON DELETE SET NULL,
  stage text NOT NULL DEFAULT 'cleaners' CHECK (stage IN ('cleaners', 'review')),
  task_names text[] NOT NULL DEFAULT '{}',
  duration_minutes integer,
  scheduled_date date,
  scheduled_time text,
  location_label text,
  -- The Tidy Pro list: how many were offered and their price range.
  cleaner_count integer,
  lowest_price numeric(10, 2),
  highest_price numeric(10, 2),
  -- The review page: the Tidy Pro picked, their price, and the total with the card fee.
  selected_tidy_pro_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  review_service_price numeric(10, 2),
  review_total_price numeric(10, 2),
  view_count integer NOT NULL DEFAULT 1,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  booked_at timestamptz,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  abandoned_at timestamptz,
  admin_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pricing_quotes_draft_idx
  ON pricing_quotes (draft_id);

-- The scheduled job's lookup: quotes that are neither booked nor flagged yet.
CREATE INDEX IF NOT EXISTS pricing_quotes_pending_idx
  ON pricing_quotes (last_viewed_at)
  WHERE booked_at IS NULL AND abandoned_at IS NULL;

CREATE INDEX IF NOT EXISTS pricing_quotes_created_idx
  ON pricing_quotes (created_at DESC);

ALTER TABLE pricing_quotes ENABLE ROW LEVEL SECURITY;

-- Every 15 minutes.
SELECT cron.unschedule('tydio-abandoned-quotes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tydio-abandoned-quotes');
SELECT cron.schedule('tydio-abandoned-quotes', '*/15 * * * *', $$SELECT public.run_scheduled_job('/api/cron/abandoned-quotes')$$);

NOTIFY pgrst, 'reload schema';
