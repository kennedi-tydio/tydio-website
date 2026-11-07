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
- [ ] Apply `supabase/migrations/053_onboarding_complete_notified.sql` (admin email when a cleaner finishes onboarding; until it's applied the email silently doesn't send)
- [x] Apply `supabase/migrations/054_profile_city_state.sql` (city/state on profiles for the /admin/users filters). Signup writes these columns and fails without them. Backfill users who signed up before the deploy: `node --env-file=.env.local scripts/backfill-profile-city-state.mjs` (dry run), then again with `--write`. Re-run it once after deploying to catch signups made on the old code. ZIP → city data is from [GeoNames](https://www.geonames.org) (CC BY 4.0); rebuild with `scripts/build-zip-cities.mjs`
- [ ] Masked calling: in the Twilio console, make sure `TWILIO_PHONE_NUMBER` has Voice enabled and set its **Voice → A call comes in** webhook to `https://<domain>/api/webhooks/twilio/voice` (HTTP POST). Calls need `NEXT_PUBLIC_SITE_URL` set, since Twilio calls back on it and signs requests with it

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
