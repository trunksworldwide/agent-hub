-- ===========================================
-- ClawdOS Database Schema
-- Phase 2: Core Tables + Phase 3: RLS Policies
-- ===========================================

-- =====================
-- Table: projects
-- =====================
CREATE TABLE public.projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  workspace_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete projects"
  ON public.projects FOR DELETE
  TO authenticated
  USING (true);

-- =====================
-- Table: agents
-- =====================
CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  name text NOT NULL,
  role text,
  emoji text,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, agent_key)
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view agents"
  ON public.agents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert agents"
  ON public.agents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update agents"
  ON public.agents FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete agents"
  ON public.agents FOR DELETE
  TO authenticated
  USING (true);

-- =====================
-- Table: tasks
-- =====================
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked')),
  assignee_agent_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (true);

-- =====================
-- Table: agent_status
-- =====================
CREATE TABLE public.agent_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  state text NOT NULL DEFAULT 'idle' CHECK (state IN ('idle', 'working', 'blocked', 'sleeping')),
  current_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  last_heartbeat_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  note text,
  UNIQUE (project_id, agent_key)
);

ALTER TABLE public.agent_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view agent_status"
  ON public.agent_status FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert agent_status"
  ON public.agent_status FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update agent_status"
  ON public.agent_status FOR UPDATE
  TO authenticated
  USING (true);

-- =====================
-- Table: task_comments
-- =====================
CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_agent_key text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view task_comments"
  ON public.task_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert task_comments"
  ON public.task_comments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update task_comments"
  ON public.task_comments FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete task_comments"
  ON public.task_comments FOR DELETE
  TO authenticated
  USING (true);

-- =====================
-- Table: activities
-- =====================
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  actor_agent_key text,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view activities"
  ON public.activities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert activities"
  ON public.activities FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =====================
-- Trigger: Auto-update updated_at on tasks
-- =====================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- Seed Data
-- =====================
INSERT INTO public.projects (id, name, workspace_path)
VALUES ('front-office', 'Front Office', '/Users/trunks/clawd')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.agents (project_id, agent_key, name, role, emoji)
VALUES ('front-office', 'agent:main:main', 'Trunks', 'Primary Agent', '⚡')
ON CONFLICT (project_id, agent_key) DO NOTHING;