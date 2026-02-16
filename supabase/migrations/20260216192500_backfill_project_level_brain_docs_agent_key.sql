-- Backfill/cleanup: project-level brain_docs for mission + project_overview
-- Fix duplicates created when agent_key was NULL (UNIQUE constraint doesn't dedupe NULLs).

-- 1) Convert NULL agent_key rows to sentinel 'project'
UPDATE public.brain_docs
SET agent_key = 'project'
WHERE agent_key IS NULL
  AND doc_type IN ('mission', 'project_overview');

-- 2) Deduplicate: keep newest updated_at per (project_id, agent_key, doc_type)
WITH ranked AS (
  SELECT
    id,
    project_id,
    agent_key,
    doc_type,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, agent_key, doc_type
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM public.brain_docs
  WHERE agent_key = 'project'
    AND doc_type IN ('mission', 'project_overview')
)
DELETE FROM public.brain_docs b
USING ranked r
WHERE b.id = r.id
  AND r.rn > 1;
