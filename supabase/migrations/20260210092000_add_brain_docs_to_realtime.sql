-- Ensure brain_docs emits Supabase Realtime events
-- Supabase Realtime only streams tables included in the `supabase_realtime` publication.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE pr.prpubid = (SELECT oid FROM pg_publication WHERE pubname = 'supabase_realtime')
      AND n.nspname = 'public'
      AND c.relname = 'brain_docs'
  ) THEN
    ALTER publication supabase_realtime ADD TABLE public.brain_docs;
  END IF;
END $$;
