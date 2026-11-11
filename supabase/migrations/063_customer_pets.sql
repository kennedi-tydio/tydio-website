-- ─────────────────────────────────────────────────────────
-- 063_customer_pets
--
-- Customers tell us about the pets in their home (or that they
-- have none) before they can book. Each pet has a required type
-- plus optional name, notes and photo. The booked Tidy
-- Pro sees them on the booking.
--
-- profiles.has_no_pets is the "I don't have any pets" answer.
-- A customer has answered once they have at least one pet row
-- or has_no_pets is true (lib/customerPets.ts).
--
-- Photos go in the private customer-pet-photos bucket under
-- "<profile id>/<uuid>.<ext>", read only through short-lived
-- signed URLs, and are removed with the account
-- (lib/accountDeletion.ts). Rows cascade with the profile.
--
-- This replaces the old free-text pets fields (profiles.pets and
-- booking_drafts.pets), which 066 drops once this code is
-- deployed. bookings.pets stays: it holds a text snapshot of
-- these pets taken when the booking is requested.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_no_pets boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.customer_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text,
  pet_type text NOT NULL CHECK (length(btrim(pet_type)) > 0),
  notes text,
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_pets_profile_id_idx ON public.customer_pets (profile_id);

-- Only the server (service role) reads and writes these.
ALTER TABLE public.customer_pets ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-pet-photos',
  'customer-pet-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
