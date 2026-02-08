-- Allow 'trainer' role in user_roles
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'player'::text, 'trainer'::text])) NOT VALID;

ALTER TABLE public.user_roles
  VALIDATE CONSTRAINT user_roles_role_check;
