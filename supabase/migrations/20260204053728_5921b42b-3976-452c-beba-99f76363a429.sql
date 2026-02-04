-- Create cron_delete_requests table for queuing delete operations
CREATE TABLE public.cron_delete_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  job_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text,
  status text NOT NULL DEFAULT 'queued',
  result jsonb,
  picked_up_at timestamptz,
  completed_at timestamptz
);

-- Create index for efficient queries
CREATE INDEX cron_delete_requests_project_time_idx 
  ON public.cron_delete_requests(project_id, requested_at DESC);

-- Enable Row Level Security
ALTER TABLE public.cron_delete_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (matching existing cron request tables pattern)
CREATE POLICY "cron_delete_requests_select_anon" ON public.cron_delete_requests
  FOR SELECT USING (true);
CREATE POLICY "cron_delete_requests_insert_anon" ON public.cron_delete_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "cron_delete_requests_update_anon" ON public.cron_delete_requests
  FOR UPDATE USING (true) WITH CHECK (true);