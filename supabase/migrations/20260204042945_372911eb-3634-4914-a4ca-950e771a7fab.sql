-- Create project_documents table for knowledge/context documents
CREATE TABLE public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('upload', 'note')),
  storage_path text,
  content_text text,
  mime_type text,
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies matching existing app pattern (anon access)
CREATE POLICY "project_documents_select_anon"
  ON public.project_documents
  FOR SELECT
  USING (true);

CREATE POLICY "project_documents_insert_anon"
  ON public.project_documents
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "project_documents_update_anon"
  ON public.project_documents
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "project_documents_delete_anon"
  ON public.project_documents
  FOR DELETE
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER update_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for document uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('clawdos-documents', 'clawdos-documents', true);

-- Storage policies for the documents bucket
CREATE POLICY "clawdos_documents_select"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'clawdos-documents');

CREATE POLICY "clawdos_documents_insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'clawdos-documents');

CREATE POLICY "clawdos_documents_update"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'clawdos-documents');

CREATE POLICY "clawdos_documents_delete"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'clawdos-documents');