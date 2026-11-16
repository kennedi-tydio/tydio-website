-- ─────────────────────────────────────────────────────────
-- 073_cancellation_reason
--
-- bookings.cancellation_reason: what the customer or Tidy Pro
--   chose when canceling (ids in lib/cancellationReasons.ts).
-- bookings.cancellation_note: their optional note.
--
-- Separate from cancelled_reason, which is a system code that
-- decides refunds and payouts.
-- ─────────────────────────────────────────────────────────

alter table public.bookings
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text;
