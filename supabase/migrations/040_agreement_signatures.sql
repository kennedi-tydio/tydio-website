-- ─────────────────────────────────────────────────────────
-- 040_agreement_signatures
--
-- One row each time a Tidy Pro e-signs a version of the Independent
-- Contractor Agreement on /pro/onboarding/agreements. It holds what's
-- needed to show who signed what and when: the agreement's Provider
-- fields as entered (legal name, entity, representative, address), a snapshot
-- of the account's name and email, IP and browser, the consent wording
-- shown, and a SHA-256 hash of the exact PDF they agreed to. The signed
-- PDF itself is in the private signed-agreements bucket.
--
-- pro_id is SET NULL on delete: the Privacy Policy keeps a signed
-- agreement after its account is deleted, for legal, tax and dispute
-- purposes. Files are named by signature id rather than under the
-- profile, so account deletion's storage cleanup never reaches them.
--
-- RLS is on with no policies, like every table since 038: only the
-- service role reads or writes it.
--
-- Safe to re-run (idempotent).
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agreement_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  agreement_version text NOT NULL,
  document_sha256 text NOT NULL,
  signed_name text NOT NULL,
  business_entity text,
  authorized_representative text,
  address text NOT NULL,
  account_name text,
  account_email text NOT NULL,
  ip_address text,
  user_agent text,
  consent_text text NOT NULL,
  signed_pdf_path text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  emailed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS agreement_signatures_pro_version_idx
  ON agreement_signatures (pro_id, agreement_version);

ALTER TABLE agreement_signatures ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('signed-agreements', 'signed-agreements', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
