-- Create chat threads table
CREATE TABLE public.project_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  title text DEFAULT 'General',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_chat_threads_project_idx 
  ON public.project_chat_threads(project_id);

ALTER TABLE public.project_chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_chat_threads_select_anon" ON public.project_chat_threads
  FOR SELECT USING (true);
CREATE POLICY "project_chat_threads_insert_anon" ON public.project_chat_threads
  FOR INSERT WITH CHECK (true);
CREATE POLICY "project_chat_threads_update_anon" ON public.project_chat_threads
  FOR UPDATE USING (true) WITH CHECK (true);

-- Create chat messages table
CREATE TABLE public.project_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  thread_id uuid REFERENCES public.project_chat_threads(id) ON DELETE CASCADE,
  author text NOT NULL,
  target_agent_key text,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_chat_messages_project_time_idx 
  ON public.project_chat_messages(project_id, created_at DESC);
CREATE INDEX project_chat_messages_thread_time_idx 
  ON public.project_chat_messages(thread_id, created_at DESC);

ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_chat_messages_select_anon" ON public.project_chat_messages
  FOR SELECT USING (true);
CREATE POLICY "project_chat_messages_insert_anon" ON public.project_chat_messages
  FOR INSERT WITH CHECK (true);
CREATE POLICY "project_chat_messages_update_anon" ON public.project_chat_messages
  FOR UPDATE USING (true) WITH CHECK (true);