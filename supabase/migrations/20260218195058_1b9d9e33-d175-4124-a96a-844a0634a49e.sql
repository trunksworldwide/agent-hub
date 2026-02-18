-- Expand brain_docs doc_type check to include 'project_rules'
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
    'mission','project_overview','capabilities','project_mission',
    'project_rules'
  ));