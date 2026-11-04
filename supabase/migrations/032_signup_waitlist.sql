-- New accounts (customers and Tidy Pros) now start on the waitlist until an
-- admin grants access from /admin/users. Tidy Pros were never gated on
-- booking_access_status before, so let every existing one in rather than
-- locking them out of /pro.
UPDATE profiles
SET booking_access_status = 'booking_allowed',
    booking_access_granted_at = coalesce(booking_access_granted_at, now()),
    waitlisted = false
WHERE role = 'TIDYPRO'
  AND booking_access_status IS DISTINCT FROM 'booking_allowed';
