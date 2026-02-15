
-- Sources table
CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  title text NOT NULL,
  source_type text NOT NULL DEFAULT 'note',
  source_url text,
  normalized_url text,
  raw_text text NOT NULL DEFAULT '',
  content_hash text NOT NULL,
  char_count int NOT NULL DEFAULT 0,
  chunk_count int NOT NULL DEFAULT 0,
  indexed boolean NOT NULL DEFAULT false,
  index_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, content_hash)
);

-- Chunks table
CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ks_project_hash ON knowledge_sources(project_id, content_hash);
CREATE INDEX idx_ks_project_url ON knowledge_sources(project_id, normalized_url);
CREATE INDEX idx_kc_project_source ON knowledge_chunks(project_id, source_id);
CREATE INDEX idx_kc_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- RLS: ENABLED but DENY ALL direct access
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Similarity search RPC
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  p_project_id text,
  p_embedding vector(1536),
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid, source_id uuid, chunk_index int,
  chunk_text text, similarity float8
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT kc.id, kc.source_id, kc.chunk_index, kc.chunk_text,
         (1 - (kc.embedding <=> p_embedding))::float8 AS similarity
  FROM knowledge_chunks kc
  WHERE kc.project_id = p_project_id AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;

-- Updated_at trigger
CREATE TRIGGER set_knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
