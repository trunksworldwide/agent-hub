
-- Delete NULL-agent_key duplicates where a 'project' version already exists
DELETE FROM public.brain_docs 
WHERE agent_key IS NULL 
  AND doc_type IN ('mission', 'project_overview')
  AND EXISTS (
    SELECT 1 FROM public.brain_docs b2 
    WHERE b2.project_id = brain_docs.project_id 
      AND b2.agent_key = 'project' 
      AND b2.doc_type = brain_docs.doc_type
  );

-- Backfill any remaining NULL agent_key rows
UPDATE public.brain_docs SET agent_key = 'project' WHERE agent_key IS NULL;

-- Make agent_key NOT NULL
ALTER TABLE public.brain_docs ALTER COLUMN agent_key SET NOT NULL;

-- Drop the old functional unique index
DROP INDEX IF EXISTS public.brain_docs_project_agent_doctype_uniq;
