-- Auto-assign existing cron jobs to Trunks (agent:main:main)
-- This is a one-time fix for jobs created before the assignment feature
UPDATE cron_mirror 
SET target_agent_key = 'agent:main:main', 
    job_intent = 'custom',
    updated_at = now()
WHERE project_id = 'front-office' 
  AND target_agent_key IS NULL;