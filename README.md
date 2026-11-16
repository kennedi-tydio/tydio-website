This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Before Deploying

- [x] **Email logo** — `lib/email.ts` shows `public/email-logo.png` in the email header, loaded from `NEXT_PUBLIC_SITE_URL`. Ship the PNG with or before that change: the Gmail app hides a broken image entirely, leaving an empty header
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the production domain in env vars
- [ ] Rotate `JWT_SECRET` and `ADMIN_SECRET` to strong random values
- [x] Remove the `/api/test-email` route (dev only)
- [x] Remove `/api/migrate` and `/api/clear-old-profiles`. Apply migrations from `supabase/migrations/` in the Supabase SQL editor instead
- [x] Lock down the public Supabase API (migration 038: RLS on every table, nothing granted to anon/authenticated). The app uses only the service role, so never add RLS policies or anon grants
- [x] Apply `supabase/migrations/031_booking_acceptance_guard.sql`
- [x] Apply `supabase/migrations/039_rate_limits.sql`
- [x] Apply `supabase/migrations/041_booking_incidents.sql`
- [x] Session revocation: a password reset or ban ends every other session (`lib/auth/sessionFingerprint.ts`)
- [x] Apply `supabase/migrations/043_booking_calls.sql`
- [x] Apply `supabase/migrations/041_ban_appeals.sql`, `042_identity_verification_form.sql` and `044_deleted_accounts.sql`
- [x] Apply `supabase/migrations/045_phone_unique_per_role.sql` and `046_identity_verification_link.sql`
- [x] Apply `supabase/migrations/040_account_suspension.sql`, `040_agreement_signatures.sql`, `042_bans_and_background_check_appeals.sql` and `047_single_screening_link.sql` (042_bans was missed at first; without `profiles.banned_at` every session check fails and no one can stay logged in)
- [x] Apply `supabase/migrations/048_tidypro_unit_number.sql` (cleaner unit number)
- [x] Apply `supabase/migrations/049_admin_user_notes.sql` (admin notes on /admin/users)
- [x] Apply `supabase/migrations/050_marketing_email_opt_in.sql` (marketing email opt-in at signup)
- [x] Apply `supabase/migrations/051_onboarding_reminders.sql` (3- and 7-day onboarding reminder emails; also schedules the daily job)
- [x] Apply `supabase/migrations/052_auth_identities.sql` (Google sign-in identities)
- [x] Apply `supabase/migrations/053_onboarding_complete_notified.sql` (admin email when a cleaner finishes onboarding; until it's applied the email silently doesn't send)
- [x] Apply `supabase/migrations/054_profile_city_state.sql` (city/state on profiles for the /admin/users filters). Signup writes these columns and fails without them. Backfill users who signed up before the deploy: `node --env-file=.env.local scripts/backfill-profile-city-state.mjs` (dry run), then again with `--write`. Re-run it once after deploying to catch signups made on the old code. ZIP → city data is from [GeoNames](https://www.geonames.org) (CC BY 4.0); rebuild with `scripts/build-zip-cities.mjs`
- [x] Apply `supabase/migrations/056_tidypro_time_off.sql` (Tidy Pro time-off dates). Search, the booking calendar, and checkout read `time_off` and fail without it
- [x] Apply `supabase/migrations/057_acceptance_rate.sql` (acceptance rate view + low-rate email flag). The Tidy Pro dashboard and /admin pages fail without it
- [x] Apply `supabase/migrations/058_admin_favorite_tidy_pros.sql` (admin favorites on /admin/users). Starring and the Favorites filter fail without it
- [x] Apply `supabase/migrations/059_customer_task_photos.sql` (private `customer-task-photos` bucket) and `061_tidypro_services.sql` (`tidypro_profiles.services_provided`)
- [x] Apply `supabase/migrations/060_task_photo_retention.sql` (`bookings.ended_at` / `task_photos_removed_at`, trigger, and the hourly photo-retention cron job)
- [x] Apply `supabase/migrations/062_initial_booking_groups.sql` (`booking_request_groups.primary_booking_id`)
- [x] Apply `supabase/migrations/063_customer_pets.sql` (customer pets + private `customer-pet-photos` bucket). Booking pages, Profile → Pets, and booking checkout read `customer_pets` / `profiles.has_no_pets` and fail without it.
- [x] Apply `supabase/migrations/065_customer_pet_notes_optional.sql` (pet notes optional). Until it's applied, saving a pet without notes fails
- [ ] **After deploying the pets code**, apply `supabase/migrations/066_drop_old_pets_text.sql` (drops the old free-text `profiles.pets` and `booking_drafts.pets`). Applying it before the deploy breaks checkout on the old code
- [x] Apply `supabase/migrations/067_unmet_booking_searches.sql` (saved searches nobody matched)
- [x] Apply `supabase/migrations/068_booking_schedule_ranges.sql` (date ranges and time windows on drafts and saved searches)
- [x] Apply `supabase/migrations/069_recurring_bookings.sql` (recurring bookings; hourly `tydio-recurring-bookings` job)
- [x] Apply `supabase/migrations/070_split_general_cleaning.sql` (General cleaning → Standard + Deep cleaning)
- [x] Apply `supabase/migrations/064_entry_instructions.sql` (`user_addresses` / `booking_drafts.entry_instructions`). Saving an address and loading Manage Addresses fail without it
- [x] Apply `supabase/migrations/071_tidypro_portfolio.sql` (before photos, photo locations, `tidypro_portfolio_items`, public `portfolio-photos` bucket; `booking_tasks` locked to the service role)
- [x] Apply `supabase/migrations/072_no_access_reported_at.sql` (`bookings.no_access_reported_at`). "Unable to access location" fails without it
- [x] Apply `supabase/migrations/073_cancellation_reason.sql` (`bookings.cancellation_reason` / `cancellation_note`). Every customer and Tidy Pro cancel fails without it
- [x] Apply `supabase/migrations/073_no_access_photo.sql` (`bookings.no_access_photo_url` / `no_access_photo_latitude` / `no_access_photo_longitude`). Canceling for no access fails without it
- [x] Apply `supabase/migrations/074_admin_review.sql` (`bookings.cancellation_resolved_at` / `cancellation_admin_note` for /admin/cancellations)
- [x] Apply `supabase/migrations/075_booking_upcharges.sql` (`booking_upcharges`, `bookings.suspended_for_upcharge_at`). Booking pages, Tidy Pro progress buttons, cancellations and payouts all fail without it
- [x] Apply `supabase/migrations/076_portfolio_uploads.sql` (`tidypro_portfolio_items.before_photo_path` nullable). Work photo uploads without a before photo fail without it
- [x] Apply `supabase/migrations/077_recurring_visit_payments.sql` (`recurring_bookings.tidy_pro_accepted_at`; `bookings.amount_due`, `payment_due_at`, `payment_attempted_at`, `payment_failed_at`, `payment_error`, `suspended_for_payment_at`, `auto_accepted`; `incident_refund_level` allows `minus_fee`; acceptance-rate view skips auto-accepted visits). Recurring bookings, booking pages, the Tidy Pro thread and no-show reports fail without it
- [ ] Masked calling: in the Twilio console, make sure `TWILIO_PHONE_NUMBER` has Voice enabled and set its **Voice → A call comes in** webhook to `https://<domain>/api/webhooks/twilio/voice` (HTTP POST). Calls need `NEXT_PUBLIC_SITE_URL` set, since Twilio calls back on it and signs requests with it

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
