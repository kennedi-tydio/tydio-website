-- ─────────────────────────────────────────────────────────
-- 099_replacement_chain
--
-- When a Tidy Pro declines a Standard / Deep Cleaning, the customer
-- now asks ONE replacement at a time, at that Tidy Pro's own price.
-- If they decline too, the customer picks another, and so on until
-- someone accepts, the customer cancels, or the booking's cutoff
-- (an hour before it starts). See lib/replacementChain.ts.
--
-- * booking_request_groups.chain: a one-at-a-time replacement round.
--   When its request is declined the group closes WITHOUT a refund
--   and the payment goes back to the original booking for the next
--   pick. original_booking_id is no longer unique, since a chain has
--   a group per step: at most one is live (open or filled) at once.
--
-- * bookings.charged_price: what the customer is paying for the
--   service itself, after any promo, before Stripe's fee. A chain
--   charges or refunds the difference between this and the next
--   Tidy Pro's price.
--
-- * booking_upcharges.replacement_difference: an extra charge for a
--   replacement who costs more. Unlike other upcharges it's part of
--   the booking's price, so it stays held when a Tidy Pro backs out.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE booking_request_groups ADD COLUMN IF NOT EXISTS chain boolean NOT NULL DEFAULT false;

ALTER TABLE booking_request_groups DROP CONSTRAINT IF EXISTS booking_request_groups_original_booking_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS booking_request_groups_one_live_per_original_idx
  ON booking_request_groups (original_booking_id)
  WHERE original_booking_id IS NOT NULL AND status IN ('open', 'filled');
CREATE INDEX IF NOT EXISTS booking_request_groups_original_idx ON booking_request_groups (original_booking_id);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS charged_price numeric(10, 2);

ALTER TABLE booking_upcharges ADD COLUMN IF NOT EXISTS replacement_difference boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
