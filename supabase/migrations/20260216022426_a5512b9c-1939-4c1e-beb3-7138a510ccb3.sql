
-- Step 1: Already applied in previous attempt (deletes + backfill + NOT NULL + drop index + drop old check)
-- Those succeeded before the check constraint failed, so now we just need steps 6-9

-- Step 6: Add expanded doc_type check INCLUDING all existing values
ALTER TABLE public.brain_docs ADD CONSTRAINT brain_docs_doc_type_check CHECK (doc_type IN ('soul','agents','user','memory_long','memory_today','mission','project_overview','capabilities','project_mission'));

-- Step 7: Deduplicate any remaining dupes (keep newest)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, agent_key, doc_type ORDER BY updated_at DESC) AS rn
  FROM public.brain_docs
)
DELETE FROM public.brain_docs b USING ranked r WHERE b.id = r.id AND r.rn > 1;

-- Step 8: Add proper UNIQUE constraint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brain_docs_project_id_agent_key_doc_type_key' AND conrelid = 'public.brain_docs'::regclass) THEN
    ALTER TABLE public.brain_docs ADD CONSTRAINT brain_docs_project_id_agent_key_doc_type_key UNIQUE (project_id, agent_key, doc_type);
  END IF;
END $$;

-- Step 9: Drop anon brain_docs policy if exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='brain_docs' AND policyname='Anon can view project mission/overview') THEN
    DROP POLICY "Anon can view project mission/overview" ON public.brain_docs;
  END IF;
END $$;
