-- Saanjh: Friends module — friendships, shared plans (infra), expenses

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_low_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_high_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_low_id, user_high_id),
  CHECK (user_low_id <> user_high_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_low
  ON public.friendships (user_low_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_high
  ON public.friendships (user_high_id);

CREATE TABLE IF NOT EXISTS public.shared_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_low_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_high_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  plan_payload JSONB,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_low_id <> user_high_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_plans_pair
  ON public.shared_plans (user_low_id, user_high_id);

DROP TRIGGER IF EXISTS shared_plans_updated_at ON public.shared_plans;
CREATE TRIGGER shared_plans_updated_at
  BEFORE UPDATE ON public.shared_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.friend_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_low_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_high_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  place TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  paid_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  split_mode TEXT NOT NULL DEFAULT 'equal',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_low_id <> user_high_id),
  CHECK (paid_by_user_id IN (user_low_id, user_high_id)),
  CHECK (split_mode = 'equal')
);

CREATE INDEX IF NOT EXISTS idx_friend_expenses_pair
  ON public.friend_expenses (user_low_id, user_high_id);

CREATE INDEX IF NOT EXISTS idx_friend_expenses_unsettled
  ON public.friend_expenses (user_low_id, user_high_id)
  WHERE settled_at IS NULL;

-- Discovery: search by display name (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_users_display_name_lower
  ON public.users (lower(display_name))
  WHERE display_name IS NOT NULL AND display_name <> '';

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_expenses ENABLE ROW LEVEL SECURITY;
