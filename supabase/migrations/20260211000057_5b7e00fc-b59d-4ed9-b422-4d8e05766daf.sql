
-- Phase 3: Create chat_delivery_queue table for operator chat delivery
CREATE TABLE IF NOT EXISTS public.chat_delivery_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  message_id uuid NOT NULL REFERENCES public.project_chat_messages(id),
  target_agent_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  picked_up_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_delivery_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies: SELECT/INSERT/UPDATE for anon
CREATE POLICY "chat_delivery_queue_select_anon" ON public.chat_delivery_queue
  FOR SELECT USING (true);

CREATE POLICY "chat_delivery_queue_insert_anon" ON public.chat_delivery_queue
  FOR INSERT WITH CHECK (true);

CREATE POLICY "chat_delivery_queue_update_anon" ON public.chat_delivery_queue
  FOR UPDATE USING (true) WITH CHECK (true);

-- Add to realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'chat_delivery_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_delivery_queue;
  END IF;
END $$;

-- Index for executor polling
CREATE INDEX IF NOT EXISTS idx_chat_delivery_queue_status
  ON public.chat_delivery_queue (project_id, status, created_at);
