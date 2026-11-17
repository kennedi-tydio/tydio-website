-- ─────────────────────────────────────────────────────────
-- 079_tip_seen_by_pro
--
-- When the Tidy Pro saw the "You received a tip!" pop-up for a
-- booking's tip. Null while a tip is waiting to be shown; set when
-- they close the pop-up. See app/pro/TipCelebrationModal.tsx.
--
-- Tips paid before this migration are marked seen so existing
-- Tidy Pros don't get a pop-up for old tips.
-- ─────────────────────────────────────────────────────────

alter table bookings add column if not exists tip_seen_by_pro_at timestamptz;

update bookings set tip_seen_by_pro_at = now()
where tip > 0 and tip_seen_by_pro_at is null;

create index if not exists bookings_unseen_tips_idx
  on bookings (tidy_pro_id)
  where tip > 0 and tip_seen_by_pro_at is null;
