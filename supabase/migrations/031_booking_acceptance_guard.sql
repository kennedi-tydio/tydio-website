-- ─────────────────────────────────────────────────────────
-- 031_booking_acceptance_guard
--
-- Accepting a booking request happens in one transaction, so a
-- cleaner can't be double booked and a replacement request can
-- only ever go to one cleaner.
--
-- accept_booking_request locks the cleaner first, so their own
-- accepts run one at a time, then refuses if they already have an
-- accepted booking overlapping this one. For a replacement request
-- sent to several cleaners, the group is claimed with a conditional
-- update: whoever reaches it first gets it, and anyone arriving at
-- the same moment waits on the row lock and then finds it filled.
--
-- Returns 'accepted', 'not_found', 'not_pending', 'conflict' or
-- 'taken'. The unique index is a backstop in case anything else
-- ever accepts a request in a group.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_booking_request(p_booking_id uuid, p_tidy_pro_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b bookings%ROWTYPE;
  b_start timestamp;
  b_end timestamp;
BEGIN
  PERFORM 1 FROM tidypro_profiles WHERE id = p_tidy_pro_id FOR UPDATE;

  SELECT * INTO b FROM bookings WHERE id = p_booking_id AND tidy_pro_id = p_tidy_pro_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF b.status IS DISTINCT FROM 'pending' THEN RETURN 'not_pending'; END IF;

  b_start := b.scheduled_date + b.scheduled_time::time;
  b_end := b_start + make_interval(mins => coalesce(b.estimated_duration_minutes, 60));

  -- A day either side catches bookings that run past midnight.
  IF EXISTS (
    SELECT 1 FROM bookings o
    WHERE o.tidy_pro_id = p_tidy_pro_id
      AND o.id <> b.id
      AND o.status NOT IN ('pending', 'cancelled', 'declined')
      AND o.scheduled_date BETWEEN b.scheduled_date - 1 AND b.scheduled_date + 1
      AND o.scheduled_time IS NOT NULL
      AND (o.scheduled_date + o.scheduled_time::time) < b_end
      AND b_start < (o.scheduled_date + o.scheduled_time::time) + make_interval(mins => coalesce(o.estimated_duration_minutes, 60))
  ) THEN
    RETURN 'conflict';
  END IF;

  IF b.request_group_id IS NOT NULL THEN
    UPDATE booking_request_groups
    SET status = 'filled', accepted_booking_id = b.id
    WHERE id = b.request_group_id AND status = 'open';
    IF NOT FOUND THEN RETURN 'taken'; END IF;
  END IF;

  UPDATE bookings
  SET decision_status = 'accepted', status = 'scheduled', tidy_pro_unread = false, user_unread = true
  WHERE id = b.id;

  RETURN 'accepted';
END;
$$;

REVOKE ALL ON FUNCTION public.accept_booking_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_booking_request(uuid, uuid) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_accepted_per_group_idx
  ON bookings (request_group_id)
  WHERE request_group_id IS NOT NULL AND status NOT IN ('pending', 'cancelled', 'declined');

NOTIFY pgrst, 'reload schema';
