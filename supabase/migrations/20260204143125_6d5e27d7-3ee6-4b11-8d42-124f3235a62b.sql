-- Add proposed/rejected/blocked tracking columns to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS is_proposed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS rejected_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rejected_reason text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS blocked_reason text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS blocked_at timestamptz DEFAULT NULL;

-- Index for filtering proposed tasks
CREATE INDEX IF NOT EXISTS tasks_proposed_idx ON public.tasks(project_id, is_proposed) WHERE is_proposed = true;

-- Index for filtering rejected tasks (done + rejected_at not null)
CREATE INDEX IF NOT EXISTS tasks_rejected_idx ON public.tasks(project_id, rejected_at) WHERE rejected_at IS NOT NULL;