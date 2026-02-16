-- Fix brain_docs so project-level mission/overview persist reliably.
-- Problem: upsert on (project_id, agent_key, doc_type) requires a matching UNIQUE constraint,
-- and NULL agent_key created duplicate rows.

-- 1) Backfill any legacy NULL agent_key rows to sentinel 'project'
UPDATE public.brain_docs
SET agent_key = 'project'
WHERE agent_key IS NULL
  AND doc_type IN ('mission', 'project_overview');

-- 2) Enforce NOT NULL agent_key going forward (we use sentinel values)
ALTER TABLE public.brain_docs
  ALTER COLUMN agent_key SET NOT NULL;

-- 3) Expand doc_type check to include mission + project_overview
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_docs_doc_type_check'
      AND conrelid = 'public.brain_docs'::regclass
  ) THEN
    ALTER TABLE public.brain_docs DROP CONSTRAINT brain_docs_doc_type_check;
  END IF;
END $$;

ALTER TABLE public.brain_docs
  ADD CONSTRAINT brain_docs_doc_type_check
  CHECK (doc_type IN (
    'soul','agents','user','memory_long','memory_today',
    'mission','project_overview'
  ));

-- 4) Ensure UNIQUE constraint exists for PostgREST upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brain_docs_project_id_agent_key_doc_type_key'
      AND conrelid = 'public.brain_docs'::regclass
  ) THEN
    ALTER TABLE public.brain_docs
      ADD CONSTRAINT brain_docs_project_id_agent_key_doc_type_key
      UNIQUE (project_id, agent_key, doc_type);
  END IF;
END $$;

-- 5) Deduplicate any existing duplicates (keep newest)
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
