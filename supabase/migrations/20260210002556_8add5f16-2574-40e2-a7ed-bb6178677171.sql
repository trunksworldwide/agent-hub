
-- Project-scoped key-value settings table
CREATE TABLE public.project_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_settings_project_key_unique UNIQUE (project_id, key)
);

-- Enable RLS
ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;

-- Open read/write for anon (matches existing project patterns)
CREATE POLICY "Anyone can read project settings"
  ON public.project_settings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert project settings"
  ON public.project_settings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update project settings"
  ON public.project_settings FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete project settings"
  ON public.project_settings FOR DELETE
  USING (true);

-- Auto-update updated_at
CREATE TRIGGER update_project_settings_updated_at
  BEFORE UPDATE ON public.project_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
