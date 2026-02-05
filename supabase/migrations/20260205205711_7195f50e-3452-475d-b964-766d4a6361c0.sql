-- Create task_outputs table to store structured outputs for completed tasks
CREATE TABLE public.task_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.projects(id),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  
  -- What kind of output
  output_type TEXT NOT NULL CHECK (output_type IN (
    'summary',      -- AI-generated or manual text summary
    'file',         -- Uploaded artifact (image, doc, etc.)
    'link',         -- External URL (deployed site, PR, etc.)
    'message',      -- Simple confirmation text
    'log_summary'   -- Auto-summarized from activity logs
  )),
  
  -- Content based on type
  title TEXT,                    -- Display name ("Final Design", "Build Log")
  content_text TEXT,             -- For summary/message/log_summary types
  storage_path TEXT,             -- For file type (bucket path)
  link_url TEXT,                 -- For link type
  mime_type TEXT,                -- For file type
  
  -- Who/when
  created_by TEXT,               -- agent_key or 'ui'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching outputs by task
CREATE INDEX idx_task_outputs_task ON public.task_outputs(task_id);

-- Enable Row Level Security
ALTER TABLE public.task_outputs ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "task_outputs_select_anon" 
  ON public.task_outputs FOR SELECT 
  USING (true);

CREATE POLICY "task_outputs_insert_anon" 
  ON public.task_outputs FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "task_outputs_update_anon" 
  ON public.task_outputs FOR UPDATE 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "task_outputs_delete_anon" 
  ON public.task_outputs FOR DELETE 
  USING (true);