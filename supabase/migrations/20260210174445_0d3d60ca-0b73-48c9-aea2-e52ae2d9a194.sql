
-- 1. Add purpose_text column to agents
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS purpose_text text;

-- 2. Migrate Ricky's long role into purpose_text, set role to short label
UPDATE public.agents
SET purpose_text = role,
    role = 'Research Agent'
WHERE agent_key = 'agent:ricky:main'
  AND project_id = 'front-office'
  AND role IS NOT NULL
  AND length(role) > 30;

-- 3. Seed agent-specific brain_docs for Ricky (USER.md)
INSERT INTO public.brain_docs (project_id, agent_key, doc_type, content, updated_by)
VALUES (
  'front-office',
  'agent:ricky:main',
  'user',
  E'# USER.md — Ricky\n\n## Role\nResearch Agent — deep research, analysis, and knowledge synthesis.\n\n## Responsibilities\n- Conduct thorough research on assigned topics\n- Summarize findings clearly and concisely\n- Propose actionable tasks based on discoveries\n- Write research digests for the team\n\n## Communication Style\n- Factual and evidence-based\n- Cite sources when possible\n- Flag uncertainty clearly\n',
  'ui'
)
ON CONFLICT DO NOTHING;

-- 4. Seed agent-specific brain_docs for Ricky (memory_long)
INSERT INTO public.brain_docs (project_id, agent_key, doc_type, content, updated_by)
VALUES (
  'front-office',
  'agent:ricky:main',
  'memory_long',
  E'# Long-term Memory — Ricky\n\n## Key Facts\n- \n\n## Research Topics\n- \n\n## Important Findings\n- \n',
  'ui'
)
ON CONFLICT DO NOTHING;
