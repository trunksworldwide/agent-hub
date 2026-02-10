
-- Phase 1: Create task_events table for unified task timeline
CREATE TABLE public.task_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  author text NOT NULL,
  content text,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_task_events_task_id ON public.task_events (task_id, created_at ASC);
CREATE INDEX idx_task_events_project_id ON public.task_events (project_id);
CREATE INDEX idx_task_events_event_type ON public.task_events (event_type);

-- Enable RLS
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;

-- RLS policies: open for anon (matching existing pattern)
CREATE POLICY "task_events_select_anon" ON public.task_events
  FOR SELECT USING (true);

CREATE POLICY "task_events_insert_anon" ON public.task_events
  FOR INSERT WITH CHECK (true);

-- Add to realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_events'
  ) THEN
    ALTER publication supabase_realtime ADD TABLE public.task_events;
  END IF;
END $$;
