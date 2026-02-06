-- Extend cron_mirror with agent assignment and job metadata fields
ALTER TABLE cron_mirror 
  ADD COLUMN IF NOT EXISTS target_agent_key TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS job_intent TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS context_policy TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS ui_label TEXT DEFAULT NULL;

-- Extend cron_create_requests with agent assignment fields
ALTER TABLE cron_create_requests 
  ADD COLUMN IF NOT EXISTS target_agent_key TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS job_intent TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS context_policy TEXT DEFAULT 'default';

-- Create indexes for filtering by agent and intent
CREATE INDEX IF NOT EXISTS idx_cron_mirror_agent ON cron_mirror(project_id, target_agent_key);
CREATE INDEX IF NOT EXISTS idx_cron_mirror_intent ON cron_mirror(project_id, job_intent);

-- Add comment for documentation
COMMENT ON COLUMN cron_mirror.target_agent_key IS 'Agent key that owns/runs this job (e.g., agent:trunks:main)';
COMMENT ON COLUMN cron_mirror.job_intent IS 'Semantic category: daily_brief, task_suggestions, monitoring, housekeeping, sync, custom';
COMMENT ON COLUMN cron_mirror.context_policy IS 'Context pack size: minimal, default, expanded';
COMMENT ON COLUMN cron_mirror.ui_label IS 'Optional human-friendly display override';