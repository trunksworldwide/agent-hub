
-- Enable pgvector in public schema to avoid cross-schema operator issues
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
