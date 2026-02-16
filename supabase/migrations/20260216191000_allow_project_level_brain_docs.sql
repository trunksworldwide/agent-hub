-- Allow project-level mission/overview brain_docs and make them readable without auth (dashboard convenience)

-- 1) Allow agent_key to be NULL for project-level docs
ALTER TABLE public.brain_docs
  ALTER COLUMN agent_key DROP NOT NULL;

-- 2) Expand allowed doc_type set
DO $$
BEGIN
  -- Drop existing check constraint if present
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
    'project_overview','mission'
  ));

-- 3) Permit anonymous SELECT for mission + project_overview only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='brain_docs' AND policyname='Anon can view project mission/overview'
  ) THEN
    CREATE POLICY "Anon can view project mission/overview"
      ON public.brain_docs FOR SELECT
      TO anon
      USING (agent_key IS NULL AND doc_type IN ('mission','project_overview'));
  END IF;
END $$;
