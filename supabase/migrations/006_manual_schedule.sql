-- Persist manual schedule commitments on users (used with Google Calendar for availability)

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS manual_schedule JSONB NOT NULL DEFAULT '[]'::jsonb;
