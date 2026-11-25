-- ─────────────────────────────────────────────────────────
-- 101_pricing_quote_details
--
-- Abandoned carts show the whole booking request, not just
-- task names and prices: home size, Standard / Deep Cleaning
-- scope, add-ons and priorities, every Tidy Task with its
-- notes and specifics, dates and times, repeat, supplies,
-- pets, notes, entry instructions, promo code and card fee.
-- Saved as display text each time prices are shown, and
-- refreshed from the draft when the quote is marked
-- abandoned. See lib/quoteDetails.ts.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE pricing_quotes ADD COLUMN IF NOT EXISTS details jsonb;

NOTIFY pgrst, 'reload schema';
