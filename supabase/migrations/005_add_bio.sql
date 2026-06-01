-- Saanjh: Add bio column to public.users (SRS §10 / Profile management)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;
