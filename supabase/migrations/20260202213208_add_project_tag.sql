-- Add `tag` to projects so the UI can highlight special/system projects.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS tag text;

-- Seed/normalize the Front Office system tag.
UPDATE public.projects
  SET tag = 'system'
  WHERE id = 'front-office' AND (tag IS NULL OR tag = '');
