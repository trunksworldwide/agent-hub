
-- Add extra_json column to skills_mirror for rich metadata
ALTER TABLE public.skills_mirror ADD COLUMN IF NOT EXISTS extra_json jsonb DEFAULT '{}'::jsonb;

-- Create skill_requests table (request queue pattern)
CREATE TABLE public.skill_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  identifier text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  result_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.skill_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read skill requests"
  ON public.skill_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert skill requests"
  ON public.skill_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update skill requests"
  ON public.skill_requests FOR UPDATE
  TO authenticated
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_skill_requests_updated_at
  BEFORE UPDATE ON public.skill_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
