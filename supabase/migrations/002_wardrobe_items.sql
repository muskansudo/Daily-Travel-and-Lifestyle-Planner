-- Saanjh: wardrobe_items table + wardrobe-photos bucket (idempotent / safe to re-run)

CREATE TABLE IF NOT EXISTS public.wardrobe_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_path TEXT NOT NULL,
  category TEXT,
  colors TEXT[] NOT NULL DEFAULT '{}',
  occasions TEXT[] NOT NULL DEFAULT '{}',
  seasons TEXT[] NOT NULL DEFAULT '{}',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  ai_tagged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user_id
  ON public.wardrobe_items (user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user_created
  ON public.wardrobe_items (user_id, created_at DESC);

DROP TRIGGER IF EXISTS wardrobe_items_updated_at ON public.wardrobe_items;
CREATE TRIGGER wardrobe_items_updated_at
  BEFORE UPDATE ON public.wardrobe_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('wardrobe-photos', 'wardrobe-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read wardrobe photos" ON storage.objects;
CREATE POLICY "Public read wardrobe photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wardrobe-photos');

DROP POLICY IF EXISTS "Service upload wardrobe photos" ON storage.objects;
CREATE POLICY "Service upload wardrobe photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'wardrobe-photos');

DROP POLICY IF EXISTS "Service update wardrobe photos" ON storage.objects;
CREATE POLICY "Service update wardrobe photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'wardrobe-photos');

DROP POLICY IF EXISTS "Service delete wardrobe photos" ON storage.objects;
CREATE POLICY "Service delete wardrobe photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'wardrobe-photos');