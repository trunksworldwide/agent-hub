
-- Create skills_mirror table
CREATE TABLE public.skills_mirror (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  skill_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '',
  installed boolean NOT NULL DEFAULT false,
  last_updated text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, skill_id)
);

ALTER TABLE public.skills_mirror ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_mirror_select_anon" ON public.skills_mirror
  FOR SELECT USING (true);

CREATE POLICY "skills_mirror_write_anon" ON public.skills_mirror
  FOR ALL USING (true) WITH CHECK (true);

-- Create channels_mirror table
CREATE TABLE public.channels_mirror (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  channel_id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'disconnected',
  last_activity text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, channel_id)
);

ALTER TABLE public.channels_mirror ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels_mirror_select_anon" ON public.channels_mirror
  FOR SELECT USING (true);

CREATE POLICY "channels_mirror_write_anon" ON public.channels_mirror
  FOR ALL USING (true) WITH CHECK (true);
