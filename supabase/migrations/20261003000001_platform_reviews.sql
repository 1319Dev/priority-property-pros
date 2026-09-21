-- Public reviews of the Priority Property Pros marketplace (not contractor booking_reviews).
-- Signed-in users insert their own row. Valid reviews auto-approve.
-- Guests cannot insert. Admins may reject. One review per user.

CREATE TYPE public.platform_review_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE public.platform_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  city text,
  rating smallint NOT NULL,
  body text NOT NULL,
  status public.platform_review_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT platform_reviews_display_name_len CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 80),
  CONSTRAINT platform_reviews_body_len CHECK (char_length(btrim(body)) BETWEEN 20 AND 1000),
  CONSTRAINT platform_reviews_city_len CHECK (city IS NULL OR char_length(btrim(city)) BETWEEN 2 AND 80),
  CONSTRAINT platform_reviews_one_per_user UNIQUE (user_id)
);

CREATE INDEX platform_reviews_approved_created_idx
  ON public.platform_reviews (created_at DESC)
  WHERE status = 'APPROVED';

CREATE INDEX platform_reviews_status_created_idx
  ON public.platform_reviews (status, created_at DESC);

COMMENT ON TABLE public.platform_reviews IS
  'Marketplace reviews of PPP. Authenticated inserts auto-approve after validation (length, rating 1-5, no contact leaks). One review per user. Guests must sign in. Admins moderate status. These are not Google reviews and are not booking_reviews.';

CREATE OR REPLACE FUNCTION public.protect_platform_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'sign in to leave a review';
    END IF;

    NEW.user_id := auth.uid();
    NEW.display_name := btrim(NEW.display_name);
    NEW.body := btrim(NEW.body);
    NEW.city := NULLIF(btrim(COALESCE(NEW.city, '')), '');

    IF public.text_contains_contact_info(NEW.display_name)
       OR public.text_contains_contact_info(NEW.body)
       OR public.text_contains_contact_info(COALESCE(NEW.city, '')) THEN
      RAISE EXCEPTION '%', public.contact_info_blocked_message();
    END IF;

    -- Auto-approve valid signed-in reviews. Admins can still reject later.
    IF NOT public.is_admin() OR NEW.status IS DISTINCT FROM 'PENDING' THEN
      NEW.status := 'APPROVED';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can change a platform review';
    END IF;
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'only an admin can delete a platform review';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_platform_review() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER platform_reviews_protect
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_platform_review();

ALTER TABLE public.platform_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_reviews TO anon, authenticated;
GRANT INSERT ON TABLE public.platform_reviews TO authenticated;
GRANT UPDATE (status) ON TABLE public.platform_reviews TO authenticated;
GRANT DELETE ON TABLE public.platform_reviews TO authenticated;

CREATE POLICY platform_reviews_select_approved
  ON public.platform_reviews
  FOR SELECT
  TO anon, authenticated
  USING (status = 'APPROVED');

CREATE POLICY platform_reviews_select_own
  ON public.platform_reviews
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY platform_reviews_select_admin
  ON public.platform_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY platform_reviews_insert_own
  ON public.platform_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY platform_reviews_update_admin
  ON public.platform_reviews
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY platform_reviews_delete_admin
  ON public.platform_reviews
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
