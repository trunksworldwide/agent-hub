
-- Delete duplicates, keeping only the most recent row per (project_id, doc_type) where agent_key IS NULL
DELETE FROM brain_docs a
USING brain_docs b
WHERE a.project_id = b.project_id
  AND a.doc_type = b.doc_type
  AND a.agent_key IS NULL
  AND b.agent_key IS NULL
  AND a.updated_at < b.updated_at;

-- Drop the existing unique constraint (it doesn't work with NULLs)
ALTER TABLE brain_docs DROP CONSTRAINT IF EXISTS brain_docs_project_id_agent_key_doc_type_key;

-- Create a NULL-safe unique index using COALESCE
CREATE UNIQUE INDEX brain_docs_project_agent_doctype_uniq
  ON brain_docs (project_id, COALESCE(agent_key, ''), doc_type);
