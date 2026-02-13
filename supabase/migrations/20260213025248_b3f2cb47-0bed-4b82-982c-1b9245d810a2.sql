
-- A. Add soft-delete columns to tasks
ALTER TABLE public.tasks ADD COLUMN deleted_at timestamptz DEFAULT NULL;
ALTER TABLE public.tasks ADD COLUMN deleted_by text DEFAULT NULL;

-- B. Create mentions table (RLS enabled, no anon policies -- service role only)
CREATE TABLE public.mentions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  agent_key text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  task_id uuid,
  thread_id uuid,
  author text NOT NULL,
  excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX mentions_dedup ON public.mentions (project_id, agent_key, source_type, source_id);
CREATE INDEX mentions_agent_lookup ON public.mentions (project_id, agent_key, created_at);

-- C. Create agent_mention_cursor table (RLS enabled, no anon policies -- service role only)
CREATE TABLE public.agent_mention_cursor (
  project_id text NOT NULL,
  agent_key text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, agent_key)
);

ALTER TABLE public.agent_mention_cursor ENABLE ROW LEVEL SECURITY;
