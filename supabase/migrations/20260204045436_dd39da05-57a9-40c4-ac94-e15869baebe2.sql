-- Create cron_mirror table for storing mirrored cron jobs from Mac mini
CREATE TABLE public.cron_mirror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  job_id text NOT NULL,
  name text NOT NULL,
  schedule_kind text,
  schedule_expr text,
  tz text,
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_duration_ms integer,
  instructions text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for project + job
CREATE UNIQUE INDEX cron_mirror_project_job_idx 
  ON public.cron_mirror(project_id, job_id);

-- Index for project lookups
CREATE INDEX cron_mirror_project_idx 
  ON public.cron_mirror(project_id);

-- Enable RLS
ALTER TABLE public.cron_mirror ENABLE ROW LEVEL SECURITY;

-- Anon read access (matches existing app pattern)
CREATE POLICY "cron_mirror_select_anon" ON public.cron_mirror
  FOR SELECT USING (true);

-- Anon write access (for Mac mini worker using anon key)
CREATE POLICY "cron_mirror_write_anon" ON public.cron_mirror
  FOR ALL USING (true) WITH CHECK (true);

-- Create cron_run_requests table for queuing run requests
CREATE TABLE public.cron_run_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  job_id text NOT NULL,
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued',
  picked_up_at timestamptz,
  completed_at timestamptz,
  result jsonb
);

-- Index for polling by project and time
CREATE INDEX cron_run_requests_project_time_idx 
  ON public.cron_run_requests(project_id, requested_at DESC);

-- Index for worker polling queued items
CREATE INDEX cron_run_requests_status_idx 
  ON public.cron_run_requests(status, requested_at);

-- Enable RLS
ALTER TABLE public.cron_run_requests ENABLE ROW LEVEL SECURITY;

-- Anon read access
CREATE POLICY "cron_run_requests_select_anon" ON public.cron_run_requests
  FOR SELECT USING (true);

-- Anon insert (UI can queue requests)
CREATE POLICY "cron_run_requests_insert_anon" ON public.cron_run_requests
  FOR INSERT WITH CHECK (true);

-- Anon update (worker can update status)
CREATE POLICY "cron_run_requests_update_anon" ON public.cron_run_requests
  FOR UPDATE USING (true) WITH CHECK (true);

-- Enable realtime for both tables
ALTER publication supabase_realtime ADD TABLE public.cron_mirror;
ALTER publication supabase_realtime ADD TABLE public.cron_run_requests;