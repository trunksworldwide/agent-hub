-- Add agent_key column to brain_docs table
ALTER TABLE public.brain_docs ADD COLUMN IF NOT EXISTS agent_key text;

-- Add unique constraint for project_id, agent_key, doc_type
-- First drop any existing constraint if it exists
ALTER TABLE public.brain_docs DROP CONSTRAINT IF EXISTS brain_docs_project_id_agent_key_doc_type_key;

-- Add the new unique constraint
ALTER TABLE public.brain_docs ADD CONSTRAINT brain_docs_project_id_agent_key_doc_type_key UNIQUE (project_id, agent_key, doc_type);

-- Create trigger for updated_at if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_brain_docs_updated_at') THEN
    CREATE TRIGGER update_brain_docs_updated_at
      BEFORE UPDATE ON public.brain_docs
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;