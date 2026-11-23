-- ─────────────────────────────────────────────────────────
-- 084: Promo codes that actually take money off a booking.
--
-- promo_codes already exists live (id, code, active, created_at, empty) but was
-- never created by a migration, so it's created here if missing and then extended.
--
-- The discount comes off what the customer pays. The Tidy Pro's cleaner_pay is still
-- 80% of the undiscounted price, and Tydio covers the difference (see lib/promoCodes).
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table promo_codes enable row level security;

-- 'percent' takes discount_value % off the booking price; 'amount' takes discount_value dollars off.
alter table promo_codes add column if not exists discount_type text not null default 'percent';
alter table promo_codes add column if not exists discount_value numeric(10,2) not null default 0;
-- Null: never expires.
alter table promo_codes add column if not exists expires_at timestamptz;
-- Null: no limit on how many bookings can use it. Each customer can use a code once either way.
alter table promo_codes add column if not exists max_redemptions integer;
-- True: only customers the code was emailed to (promo_code_recipients) can use it.
alter table promo_codes add column if not exists recipients_only boolean not null default false;

do $$ begin
  alter table promo_codes add constraint promo_codes_discount_type_check check (discount_type in ('percent', 'amount'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table promo_codes add constraint promo_codes_max_redemptions_check check (max_redemptions is null or max_redemptions > 0);
exception when duplicate_object then null; end $$;

-- Codes are matched without regard to case, so SAVE10 and save10 can't both exist.
create unique index if not exists promo_codes_code_lower_unique on promo_codes (lower(code));

-- Who each code was emailed to, and when.
create table if not exists promo_code_recipients (
  promo_code_id uuid not null references promo_codes(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  emailed_at timestamptz not null default now(),
  primary key (promo_code_id, profile_id)
);

alter table promo_code_recipients enable row level security;

-- The code a booking used and how much it took off the booking price (before the card fee).
alter table bookings add column if not exists promo_code_id uuid references promo_codes(id) on delete set null;
alter table bookings add column if not exists promo_discount numeric(10,2);

create index if not exists bookings_promo_code_id_idx on bookings (promo_code_id) where promo_code_id is not null;

-- Codes turned away because Tydio's Stripe balance couldn't cover the difference
-- (see lib/promoFunding), listed on /admin/promo-codes. A snapshot of what the admin
-- was emailed, so it reads the same after the draft or accounts are gone.
create table if not exists promo_code_failures (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid references promo_codes(id) on delete set null,
  code text not null,
  discount_label text not null,
  -- 'applied' at checkout, or 'confirmed' when the card was about to be charged.
  stage text not null check (stage in ('applied', 'confirmed')),
  customer_id uuid references profiles(id) on delete set null,
  customer_label text,
  tidy_pro_id uuid references profiles(id) on delete set null,
  tidy_pro_label text,
  scheduled_date text,
  scheduled_time text,
  task_names text[] not null default '{}',
  service_price numeric(10,2) not null,
  discount numeric(10,2) not null,
  customer_pays numeric(10,2) not null,
  cleaner_pay numeric(10,2) not null,
  shortfall numeric(10,2) not null,
  -- Null when Stripe couldn't be asked.
  available_balance numeric(10,2),
  committed numeric(10,2) not null default 0,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table promo_code_failures enable row level security;

create index if not exists promo_code_failures_created_at_idx on promo_code_failures (created_at desc);
