-- Add `brain_docs` for per-agent/project SOUL/USER/MEMORY docs.

CREATE TABLE IF NOT EXISTS public.brain_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('soul', 'agents', 'user', 'memory_long', 'memory_today')),
  content text NOT NULL DEFAULT '',
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, agent_key, doc_type)
);

ALTER TABLE public.brain_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view brain_docs"
  ON public.brain_docs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert brain_docs"
  ON public.brain_docs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update brain_docs"
  ON public.brain_docs FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete brain_docs"
  ON public.brain_docs FOR DELETE
  TO authenticated
  USING (true);

-- Keep updated_at current (re-use the existing helper if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    -- Only create the trigger if it doesn't already exist.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'update_brain_docs_updated_at'
    ) THEN
      CREATE TRIGGER update_brain_docs_updated_at
        BEFORE UPDATE ON public.brain_docs
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;
