-- ─────────────────────────────────────────────────────────
-- 010_payment_methods
--
-- Adds a payment_methods table (card display metadata only —
-- brand/last4/expiry — no PAN storage) plus the booking_drafts
-- fields needed for the "Review Your Request" screen: pets,
-- notes, supplies, gift code, and the selected payment method
-- for that booking. Card creation is a manual placeholder until
-- Stripe Connect + Elements replace it.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  brand text not null,
  last4 text not null,
  exp_month integer not null,
  exp_year integer not null,
  is_default boolean default false,
  created_at timestamptz default now()
);

alter table payment_methods enable row level security;

drop policy if exists "Customers can manage own payment methods" on payment_methods;
create policy "Customers can manage own payment methods"
  on payment_methods for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS pets text;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS supplies_provided boolean DEFAULT false;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS gift_code text;
ALTER TABLE booking_drafts ADD COLUMN IF NOT EXISTS selected_payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL;
