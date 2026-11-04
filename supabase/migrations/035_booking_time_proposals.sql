-- A Tidy Pro can suggest a different start time for a booking. The suggestion is
-- a message in the booking's thread so it sits in order with the chat, and the
-- customer approves or declines it from there. The proposed date and time are in
-- the booking's own time zone, like bookings.scheduled_date/scheduled_time.
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS proposed_date date;
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS proposed_time text;
ALTER TABLE booking_messages ADD COLUMN IF NOT EXISTS proposal_status text;

ALTER TABLE booking_messages DROP CONSTRAINT IF EXISTS booking_messages_kind_check;
ALTER TABLE booking_messages ADD CONSTRAINT booking_messages_kind_check
  CHECK (kind IN ('text', 'time_proposal'));

ALTER TABLE booking_messages DROP CONSTRAINT IF EXISTS booking_messages_proposal_status_check;
ALTER TABLE booking_messages ADD CONSTRAINT booking_messages_proposal_status_check
  CHECK (proposal_status IS NULL OR proposal_status IN ('pending', 'approved', 'declined', 'withdrawn'));

NOTIFY pgrst, 'reload schema';
