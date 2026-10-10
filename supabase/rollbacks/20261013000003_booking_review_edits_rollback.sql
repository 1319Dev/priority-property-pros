-- Rollback for 20261013000003_booking_review_edits.sql.
-- Drops the edit RPC, the edit-window setting, and the two new columns.
-- Does not change rating, body, reviewer_role, is_verified, created_at,
-- the existing UNIQUE (booking_id, reviewer_role) constraint, RLS, triggers,
-- submit_booking_review, or contractor_public_ratings / contractor_public_reviews.

DROP FUNCTION IF EXISTS public.update_booking_review(uuid, integer, text);

ALTER TABLE public.booking_reviews
  DROP COLUMN IF EXISTS edited_at,
  DROP COLUMN IF EXISTS updated_at;

DELETE FROM public.platform_settings WHERE key = 'booking_review_edit_window_days';
