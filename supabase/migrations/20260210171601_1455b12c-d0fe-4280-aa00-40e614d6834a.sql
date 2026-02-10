
-- Add columns to agents table for provisioning
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS agent_id_short text,
  ADD COLUMN IF NOT EXISTS workspace_path text,
  ADD COLUMN IF NOT EXISTS provisioned boolean NOT NULL DEFAULT false;

-- Create agent_provision_requests table (same queue pattern as cron_run_requests)
CREATE TABLE public.agent_provision_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  agent_key text NOT NULL,
  agent_id_short text NOT NULL,
  display_name text NOT NULL,
  emoji text,
  role_short text,
  status text NOT NULL DEFAULT 'queued',
  result jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  picked_up_at timestamptz,
  completed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.agent_provision_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies (same open anon pattern as other request tables)
CREATE POLICY "agent_provision_requests_select_anon"
  ON public.agent_provision_requests FOR SELECT
  USING (true);

CREATE POLICY "agent_provision_requests_insert_anon"
  ON public.agent_provision_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "agent_provision_requests_update_anon"
  ON public.agent_provision_requests FOR UPDATE
  USING (true)
  WITH CHECK (true);
