-- Core identity table. id matches auth.users.id.

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text,
  avatar_url text,
  account_type public.account_type NOT NULL DEFAULT 'CUSTOMER',
  account_status public.account_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_account_type_idx ON public.profiles (account_type);
CREATE INDEX profiles_account_status_idx ON public.profiles (account_status);

COMMENT ON TABLE public.profiles IS
  'PPP identity. account_type and account_status are the source of truth for authorization.';

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
