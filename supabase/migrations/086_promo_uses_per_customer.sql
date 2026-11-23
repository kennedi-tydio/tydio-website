-- ─────────────────────────────────────────────────────────
-- 086: How many bookings each customer can use a promo code on.
-- Null: no limit. Existing codes keep one use per customer.
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

alter table promo_codes add column if not exists max_uses_per_customer integer default 1;

do $$ begin
  alter table promo_codes add constraint promo_codes_max_uses_per_customer_check check (max_uses_per_customer is null or max_uses_per_customer > 0);
exception when duplicate_object then null; end $$;
