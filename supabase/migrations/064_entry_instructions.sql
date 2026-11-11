-- ─────────────────────────────────────────────────────────
-- 064_entry_instructions
--
-- Customers can save entry instructions (gate codes, where a
-- key is kept) on each saved address, from Profile → Manage
-- Addresses or from the booking review step. The review step
-- prefills from the chosen address, and the draft holds what
-- the customer typed until bookings.entry_instructions takes a
-- copy when the booking is requested.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS entry_instructions text;

ALTER TABLE public.booking_drafts
  ADD COLUMN IF NOT EXISTS entry_instructions text;

NOTIFY pgrst, 'reload schema';
