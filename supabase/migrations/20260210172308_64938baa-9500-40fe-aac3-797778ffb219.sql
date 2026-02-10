
-- Backfill Trunks as provisioned (already running on Mac mini)
UPDATE agents
SET provisioned = true,
    agent_id_short = 'main',
    workspace_path = '/Users/trunks/clawd'
WHERE project_id = 'front-office'
  AND agent_key = 'agent:main:main';

-- Queue a provision request for Ricky
INSERT INTO agent_provision_requests (project_id, agent_key, agent_id_short, display_name, emoji, role_short, status)
VALUES ('front-office', 'agent:ricky:main', 'ricky', 'Ricky', '🔬', 'Research Agent', 'queued')
ON CONFLICT DO NOTHING;
