-- Tydio Booking MVP — Schema Migration
-- Run this in the Supabase SQL editor.
-- All statements are idempotent (safe to re-run).
--
-- Existing table mapping:
--   customers       → profiles
--   cleaners        → tidypro_profiles (+ profiles for identity)
--   booking_requests → bookings
--   background_checks → already exists (adding columns)


-- ─────────────────────────────────────────────────────────
-- profiles — notification opt-outs (customers + tidypros)
-- ─────────────────────────────────────────────────────────
alter table profiles add column if not exists sms_notifications_enabled boolean default true;
alter table profiles add column if not exists email_notifications_enabled boolean default true;


-- ─────────────────────────────────────────────────────────
-- bookings — new pricing + task fields
-- Note: task_amount/service_fee/total_amount (int4, cents) already exist.
-- New decimal fields coexist alongside them.
-- stripe_payment_intent_id already exists — not re-added.
-- ─────────────────────────────────────────────────────────
alter table bookings add column if not exists task_list jsonb;
alter table bookings add column if not exists pricing_version text;
alter table bookings add column if not exists pricing_breakdown jsonb;
alter table bookings add column if not exists tip numeric(10,2) default 0;
alter table bookings add column if not exists customer_subtotal numeric(10,2);
alter table bookings add column if not exists total_customer_charge numeric(10,2);
alter table bookings add column if not exists cleaner_pay numeric(10,2);
alter table bookings add column if not exists quote_locked_at timestamptz;
alter table bookings add column if not exists unusual_notes text;
alter table bookings add column if not exists stripe_payment_link text;
alter table bookings add column if not exists cleaner_marked_complete_at timestamptz;
alter table bookings add column if not exists customer_dispute_deadline timestamptz;
alter table bookings add column if not exists payout_release_at timestamptz;
-- Customer-release payment flow
alter table bookings add column if not exists payment_release_token text unique;
alter table bookings add column if not exists payout_released_by_customer boolean default false;


-- ─────────────────────────────────────────────────────────
-- tidypro_profiles — terms, status, approval, alerts, stats, insurance
-- Note: rating, review_count, total_earnings, is_insured, profile_photo_url
--       already exist — not re-added.
-- ─────────────────────────────────────────────────────────

-- Terms
alter table tidypro_profiles add column if not exists terms_accepted boolean default false;
alter table tidypro_profiles add column if not exists terms_accepted_at timestamptz;

-- Cleaner status machine
alter table tidypro_profiles add column if not exists cleaner_status text default 'applied';

-- Approval
alter table tidypro_profiles add column if not exists approved_at timestamptz;
alter table tidypro_profiles add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table tidypro_profiles add column if not exists paused_at timestamptz;
alter table tidypro_profiles add column if not exists pause_reason text;

-- Booking alerts & notification prefs
alter table tidypro_profiles add column if not exists booking_alerts_enabled boolean default true;
alter table tidypro_profiles add column if not exists sms_notifications_enabled boolean default true;
alter table tidypro_profiles add column if not exists email_notifications_enabled boolean default true;

-- Additional stats (rating, review_count, total_earnings already exist)
alter table tidypro_profiles add column if not exists total_accepted_bookings integer default 0;
alter table tidypro_profiles add column if not exists total_cancelled_bookings integer default 0;
alter table tidypro_profiles add column if not exists pending_earnings numeric(10,2) default 0;
alter table tidypro_profiles add column if not exists paid_earnings numeric(10,2) default 0;
alter table tidypro_profiles add column if not exists total_tips numeric(10,2) default 0;

-- Insurance additions (is_insured bool already exists)
alter table tidypro_profiles add column if not exists insurance_status text;
alter table tidypro_profiles add column if not exists insurance_provider text;
alter table tidypro_profiles add column if not exists insurance_policy_expiration_date date;
alter table tidypro_profiles add column if not exists insurance_document_url text;
alter table tidypro_profiles add column if not exists insurance_verified_at timestamptz;
alter table tidypro_profiles add column if not exists insurance_verified_by uuid references auth.users(id) on delete set null;

-- Payout security — pause payouts when bank/payout info changes
alter table tidypro_profiles add column if not exists payout_paused_until timestamptz;
alter table tidypro_profiles add column if not exists payout_pause_reason text;


-- ─────────────────────────────────────────────────────────
-- background_checks — add Checkr-specific tracking columns
-- Existing: id, pro_id, provider, status, reference, created_at, updated_at
-- ─────────────────────────────────────────────────────────
alter table background_checks add column if not exists checkr_invitation_id text;
alter table background_checks add column if not exists background_check_manual_review_notes text;
alter table background_checks add column if not exists invited_at timestamptz;
alter table background_checks add column if not exists completed_at timestamptz;


-- ─────────────────────────────────────────────────────────
-- booking_drafts (new table)
-- ─────────────────────────────────────────────────────────
create table if not exists booking_drafts (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid references auth.users(id) on delete cascade,
  task_list jsonb,
  pricing_breakdown jsonb,
  last_step_reached integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table booking_drafts enable row level security;

drop policy if exists "Customers can manage own drafts" on booking_drafts;
create policy "Customers can manage own drafts"
  on booking_drafts for all
  using (customer_user_id = auth.uid())
  with check (customer_user_id = auth.uid());

drop policy if exists "Admins can read all drafts" on booking_drafts;
create policy "Admins can read all drafts"
  on booking_drafts for select
  using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'ADMIN'  -- verify this value exists; USER and TIDYPRO confirmed
    )
  );


-- ─────────────────────────────────────────────────────────
-- job_notifications (new table)
-- tidypro_id references profiles(id) — matches existing bookings.tidy_pro_id pattern
-- ─────────────────────────────────────────────────────────
create table if not exists job_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  tidypro_id uuid references profiles(id) on delete cascade,
  claim_token text unique not null,
  status text default 'sent',
  sent_at timestamptz default now(),
  claimed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz default now()
);

alter table job_notifications enable row level security;

drop policy if exists "TidyPros can view own notifications" on job_notifications;
create policy "TidyPros can view own notifications"
  on job_notifications for select
  using (tidypro_id = auth.uid());

drop policy if exists "Admins can manage all notifications" on job_notifications;
create policy "Admins can manage all notifications"
  on job_notifications for all
  using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'ADMIN'  -- verify this value exists; USER and TIDYPRO confirmed
    )
  );


-- ─────────────────────────────────────────────────────────
-- payments (new table — for cleaner payout tracking)
-- ─────────────────────────────────────────────────────────
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  amount numeric(10,2) not null,
  cleaner_pay numeric(10,2) not null,
  platform_fee numeric(10,2) not null,
  tip numeric(10,2) default 0,
  status text default 'pending',
  paid_at timestamptz,
  payout_status text default 'pending',
  payout_released_at timestamptz,
  created_at timestamptz default now()
);

alter table payments enable row level security;

drop policy if exists "Customers can view own payments" on payments;
create policy "Customers can view own payments"
  on payments for select
  using (
    booking_id in (
      select id from bookings where user_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage all payments" on payments;
create policy "Admins can manage all payments"
  on payments for all
  using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'ADMIN'  -- verify this value exists; USER and TIDYPRO confirmed
    )
  );


-- ─────────────────────────────────────────────────────────
-- notification_batches (new table)
-- ─────────────────────────────────────────────────────────
create table if not exists notification_batches (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  tidypro_count integer not null default 0,
  sms_sent integer not null default 0,
  email_sent integer not null default 0,
  created_at timestamptz default now()
);

alter table notification_batches enable row level security;

drop policy if exists "Admins can read batches" on notification_batches;
create policy "Admins can read batches"
  on notification_batches for select
  using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'ADMIN'  -- verify this value exists; USER and TIDYPRO confirmed
    )
  );


-- ─────────────────────────────────────────────────────────
-- completion_events (new table)
-- ─────────────────────────────────────────────────────────
create table if not exists completion_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  type text not null,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

alter table completion_events enable row level security;

drop policy if exists "Admins can read completion events" on completion_events;
create policy "Admins can read completion events"
  on completion_events for select
  using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'ADMIN'  -- verify this value exists; USER and TIDYPRO confirmed
    )
  );


-- ─────────────────────────────────────────────────────────
-- customer_reviews_of_cleaners (new table)
-- Separate from existing `reviews` table (which is single-direction/single-rating).
-- customer_id and tidypro_id both reference profiles(id).
-- ─────────────────────────────────────────────────────────
create table if not exists customer_reviews_of_cleaners (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  customer_id uuid references profiles(id) on delete set null,
  tidypro_id uuid references profiles(id) on delete set null,
  review_token text unique not null,
  overall_rating integer check (overall_rating between 1 and 5),
  quality_rating integer check (quality_rating between 1 and 5),
  timeliness_rating integer check (timeliness_rating between 1 and 5),
  communication_rating integer check (communication_rating between 1 and 5),
  written_feedback text,
  submitted_at timestamptz,
  created_at timestamptz default now()
);

alter table customer_reviews_of_cleaners enable row level security;

drop policy if exists "Review token access - customer reviews" on customer_reviews_of_cleaners;
create policy "Review token access - customer reviews"
  on customer_reviews_of_cleaners for all
  using (true);


-- ─────────────────────────────────────────────────────────
-- cleaner_reviews_of_customers (new table)
-- ─────────────────────────────────────────────────────────
create table if not exists cleaner_reviews_of_customers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  tidypro_id uuid references profiles(id) on delete set null,
  customer_id uuid references profiles(id) on delete set null,
  review_token text unique not null,
  customer_rating integer check (customer_rating between 1 and 5),
  communication_rating integer check (communication_rating between 1 and 5),
  access_instructions_rating integer check (access_instructions_rating between 1 and 5),
  safety_comfort_rating integer check (safety_comfort_rating between 1 and 5),
  would_clean_again boolean,
  written_feedback text,
  submitted_at timestamptz,
  created_at timestamptz default now()
);

alter table cleaner_reviews_of_customers enable row level security;

drop policy if exists "Review token access - cleaner reviews" on cleaner_reviews_of_customers;
create policy "Review token access - cleaner reviews"
  on cleaner_reviews_of_customers for all
  using (true);


-- ─────────────────────────────────────────────────────────
-- risk_events (new table — fraud / operational risk tracking)
-- ─────────────────────────────────────────────────────────
create table if not exists risk_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,  -- customer_complaint | cleaner_no_show | chargeback | refund_requested | bank_account_changed | duplicate_cleaner_detected | suspicious_booking
  booking_id uuid references bookings(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,   -- the user the event is about
  severity text not null default 'low',                      -- low | medium | high | critical
  description text,
  metadata jsonb,                                            -- event-specific data (IP, Stripe event ID, etc.)
  resolved_at timestamptz,
  resolution_notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table risk_events enable row level security;

drop policy if exists "Admins can manage all risk events" on risk_events;
create policy "Admins can manage all risk events"
  on risk_events for all
  using (
    exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'ADMIN'
    )
  );


-- ─────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_booking_drafts_updated_at on booking_drafts;
create trigger set_booking_drafts_updated_at
  before update on booking_drafts
  for each row execute function set_updated_at();
