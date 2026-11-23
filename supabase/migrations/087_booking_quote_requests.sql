-- ─────────────────────────────────────────────────────────
-- 087_booking_quote_requests
--
-- The fallback for when automatic pricing (OpenAI) is down. A task
-- the AI couldn't price is saved as "needs a quote" (task.needsQuote),
-- and pet enclosure / litter box photos are saved without being
-- checked. A booking with any such task isn't charged up front: it's
-- sent to the chosen Tidy Pro as a quote request. See
-- lib/quoteRequests.ts.
--
--   1. requested  the customer sent it; nothing charged. The tasks
--                 leave their dashboard while it's out.
--   2. quoted     the Tidy Pro priced each task in dollars
--                 (quoted_task_list, task.quotedPrice).
--   3. paid       the customer pressed "Approve & Pay" and the card
--                 was charged: placeBooking created a normal pending
--                 booking (booking_id), which the Tidy Pro accepts or
--                 declines as usual.
--   Ends early:
--      pro_declined       the Tidy Pro won't quote it
--      customer_declined  the customer declined the quote, or
--                         withdrew the request before it was quoted
--      expired            not quoted and paid before the acceptance
--                         window closed (an hour before the start)
--   Every early end puts the tasks back on the customer's dashboard.
--   "paying" is a short lock while the card is being charged, so a
--   double tap can't charge twice; it goes back to "quoted" if the
--   charge fails.
--
-- Service role only. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS booking_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tidy_pro_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- The booking as the customer asked for it (the draft's fields).
  task_list jsonb NOT NULL,
  full_service jsonb,
  scheduled_location jsonb NOT NULL,
  scheduled_date date NOT NULL,
  -- "HH:MM", local to the home, as on booking_drafts.
  scheduled_time text NOT NULL,
  time_zone text NOT NULL,
  notes text,
  entry_instructions text,
  supplies_provided boolean NOT NULL DEFAULT false,
  gift_code text,
  recurrence_frequency text,
  save_entry_instructions boolean NOT NULL DEFAULT false,
  selected_payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
  -- The task list with the Tidy Pro's times filled in.
  quoted_task_list jsonb,
  -- What the quote came to when it was sent, for the lists. The
  -- customer's page reprices it live, the same way the charge does.
  quoted_service_price numeric(10, 2),
  quoted_cleaner_pay numeric(10, 2),
  tidy_pro_note text,
  decline_reason text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'quoted', 'paying', 'paid', 'pro_declined', 'customer_declined', 'expired')),
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  user_unread boolean NOT NULL DEFAULT false,
  tidy_pro_unread boolean NOT NULL DEFAULT true,
  quoted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_quote_requests_user_idx ON booking_quote_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_quote_requests_tidy_pro_idx ON booking_quote_requests (tidy_pro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_quote_requests_open_idx
  ON booking_quote_requests (status)
  WHERE status IN ('requested', 'quoted', 'paying');

ALTER TABLE booking_quote_requests ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
