-- Phase 1: Context Flow Architecture - Database Schema Changes

-- 1.1 Extend project_documents table for scoping and context pack
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS agent_key TEXT DEFAULT NULL;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'general';
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS sensitivity TEXT DEFAULT 'normal';
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS doc_notes JSONB DEFAULT NULL;

-- Add indexes for efficient Context Pack queries
CREATE INDEX IF NOT EXISTS idx_project_docs_agent ON project_documents(project_id, agent_key);
CREATE INDEX IF NOT EXISTS idx_project_docs_pinned ON project_documents(project_id, pinned) WHERE pinned = true;

-- 1.3 Add context snapshot to tasks for auditing
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS context_snapshot JSONB DEFAULT NULL;

-- Comments for documentation
COMMENT ON COLUMN project_documents.agent_key IS 'NULL = global (all agents), specific key = agent-only document';
COMMENT ON COLUMN project_documents.pinned IS 'Pinned docs are always included in Context Pack';
COMMENT ON COLUMN project_documents.doc_type IS 'Values: general, playbook, reference, credentials, style_guide';
COMMENT ON COLUMN project_documents.sensitivity IS 'Values: normal, contains_secrets (secrets get pointer-only treatment)';
COMMENT ON COLUMN project_documents.doc_notes IS 'Structured extraction: { summary, key_facts, rules, keywords, extracted_at }';
COMMENT ON COLUMN tasks.context_snapshot IS 'Snapshot of Context Pack delivered with task: { built_at, docs_included, project_overview_preview }';