-- Add summary column to activities table
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS summary text;

-- Create cron_job_patch_requests table
CREATE TABLE public.cron_job_patch_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  job_id text NOT NULL,
  patch_json jsonb NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text,
  status text NOT NULL DEFAULT 'queued',
  result jsonb,
  picked_up_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX cron_job_patch_requests_project_time_idx 
  ON public.cron_job_patch_requests(project_id, requested_at DESC);

ALTER TABLE public.cron_job_patch_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_job_patch_requests_select_anon" ON public.cron_job_patch_requests
  FOR SELECT USING (true);
CREATE POLICY "cron_job_patch_requests_insert_anon" ON public.cron_job_patch_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "cron_job_patch_requests_update_anon" ON public.cron_job_patch_requests
  FOR UPDATE USING (true) WITH CHECK (true);

-- Create cron_create_requests table
CREATE TABLE public.cron_create_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  name text NOT NULL,
  schedule_kind text,
  schedule_expr text NOT NULL,
  tz text,
  instructions text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text,
  status text NOT NULL DEFAULT 'queued',
  result jsonb,
  picked_up_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX cron_create_requests_project_time_idx 
  ON public.cron_create_requests(project_id, requested_at DESC);

ALTER TABLE public.cron_create_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_create_requests_select_anon" ON public.cron_create_requests
  FOR SELECT USING (true);
CREATE POLICY "cron_create_requests_insert_anon" ON public.cron_create_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "cron_create_requests_update_anon" ON public.cron_create_requests
  FOR UPDATE USING (true) WITH CHECK (true);