-- ─────────────────────────────────────────────────────────
-- 083_customer_sms_phone
--
-- A customer can give a different number for texts than the
-- phone on their profile (in the SMS opt-in pop-up or on
-- Profile → Notifications). profiles.sms_phone holds that
-- number; texts go to it when set, and to profiles.phone
-- otherwise. Null means "text the phone on file".
-- (lib/smsPhone.ts, app/actions/notificationConsent.ts.)
--
-- Customers only: Tidy Pros are still texted at their
-- tidypro_profiles.phone.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sms_phone text;

NOTIFY pgrst, 'reload schema';
