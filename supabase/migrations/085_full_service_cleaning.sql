-- ─────────────────────────────────────────────────────────
-- 085_full_service_cleaning
--
-- Standard and Deep Cleaning, priced by each Tidy Pro
-- (lib/fullService.ts, lib/fullServicePricing.ts,
-- lib/fullServiceRates.ts).
--
-- tidypro_full_service_rates: one row per Tidy Pro.
--   standard_base_take_home / deep_base_take_home
--       What the Tidy Pro takes home for a full-home clean before
--       the home-size multiplier. The customer pays it ÷ 0.8.
--       Null = they haven't priced that service, so they aren't
--       matched to it.
--   standard_room_percents / deep_room_percents
--       {room_key: percent}. Only the rooms the Tidy Pro changed
--       from Tydio's defaults. Percentages, never dollars, so room
--       prices follow the base rate when it changes.
--   add_ons
--       {addon_key: {"enabled": bool, "take_home": number|null}}.
--       A missing key means offered at the default price.
--
-- booking_drafts.full_service       the customer's selection while
--                                   booking (FullServiceSelection)
-- bookings.full_service             what was booked and priced, with
--                                   the rates used (snapshot)
-- recurring_bookings.full_service   the selection every visit repeats
-- booking_tasks.kind                'task', or a full-service checklist
--                                   row (whole home, a room, an add-on)
-- booking_tasks.service_price       a full-service row's share of the
--                                   Service Price, so an unfinished room
--                                   or add-on can be refunded on its own
--
-- Service role only. Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tidypro_full_service_rates (
  tidy_pro_id uuid PRIMARY KEY REFERENCES tidypro_profiles(id) ON DELETE CASCADE,
  standard_base_take_home numeric(10, 2)
    CHECK (standard_base_take_home IS NULL OR (standard_base_take_home >= 20 AND standard_base_take_home <= 2000)),
  deep_base_take_home numeric(10, 2)
    CHECK (deep_base_take_home IS NULL OR (deep_base_take_home >= 20 AND deep_base_take_home <= 2000)),
  standard_room_percents jsonb NOT NULL DEFAULT '{}'::jsonb,
  deep_room_percents jsonb NOT NULL DEFAULT '{}'::jsonb,
  add_ons jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tidypro_full_service_rates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_drafts ADD COLUMN IF NOT EXISTS full_service jsonb;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS full_service jsonb;
ALTER TABLE public.recurring_bookings ADD COLUMN IF NOT EXISTS full_service jsonb;

ALTER TABLE public.booking_tasks ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'task';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_tasks_kind_check') THEN
    ALTER TABLE public.booking_tasks ADD CONSTRAINT booking_tasks_kind_check
      CHECK (kind IN ('task', 'full_service_home', 'full_service_room', 'full_service_addon'));
  END IF;
END $$;
ALTER TABLE public.booking_tasks ADD COLUMN IF NOT EXISTS service_price numeric(10, 2);

NOTIFY pgrst, 'reload schema';
