-- Customers must give each saved address an approximate size. Nullable only
-- so existing addresses survive; the app requires it on every new address
-- and asks for it before an older address can be used to book.
ALTER TABLE user_addresses ADD COLUMN IF NOT EXISTS square_footage text;

ALTER TABLE user_addresses DROP CONSTRAINT IF EXISTS user_addresses_square_footage_check;
ALTER TABLE user_addresses ADD CONSTRAINT user_addresses_square_footage_check
  CHECK (square_footage IS NULL OR square_footage IN ('under_1000', '1000_1999', '2000_2999', '3000_plus'));

NOTIFY pgrst, 'reload schema';
