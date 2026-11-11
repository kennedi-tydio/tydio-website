-- ─────────────────────────────────────────────────────────
-- 066_drop_old_pets_text
--
-- Drops the old free-text pets fields, replaced by customer_pets
-- (063): profiles.pets (Profile screen) and booking_drafts.pets
-- (checkout). Existing text isn't carried over; customers add
-- their pets one by one instead. bookings.pets stays.
--
-- APPLY ONLY AFTER the code that stops reading these columns is
-- deployed — the older code selects them at checkout and on the
-- Profile screen and fails without them.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.profiles DROP COLUMN IF EXISTS pets;
ALTER TABLE public.booking_drafts DROP COLUMN IF EXISTS pets;
