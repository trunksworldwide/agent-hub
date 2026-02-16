-- Security hardening: do not allow anonymous reads of brain_docs.
-- Mission/Overview should be visible only to authenticated dashboard users.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='brain_docs' AND policyname='Anon can view project mission/overview'
  ) THEN
    DROP POLICY "Anon can view project mission/overview" ON public.brain_docs;
  END IF;
END $$;
