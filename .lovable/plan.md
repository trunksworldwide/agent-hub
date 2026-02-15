

# Revised Plan v3: Vector Search, Auto-Ingestion, Health Reports, Fallback Chain, Agent Auto-Awareness

## Security Fixes Applied (from your feedback)

1. **RLS**: No `USING(true)` SELECT policies. Knowledge tables deny all direct browser access. All reads go through Control API (which uses service-role).
2. **knowledge-worker**: `verify_jwt = true`. Only callable by Control API (with service-role key) or other edge functions. Never publicly exposed.
3. **URL extraction**: Add junk-page heuristics (ratio of text-to-HTML, minimum paragraph count, reject if mostly nav/footer).
4. **PDF/unsupported files**: Always create a `knowledge_source` placeholder with `indexed: false` and `index_error: "unsupported_file_type"`.

---

## Phase 1: Database Foundation

### Migration SQL

```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

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

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ks_project_hash ON knowledge_sources(project_id, content_hash);
CREATE INDEX idx_ks_project_url ON knowledge_sources(project_id, normalized_url);
CREATE INDEX idx_kc_project_source ON knowledge_chunks(project_id, source_id);
CREATE INDEX idx_kc_embedding ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

-- RLS: ENABLED but DENY ALL direct access.
-- All reads/writes go through Control API (service-role).
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
-- No policies created = no access for anon or authenticated roles.

-- Similarity search RPC (callable by service-role only since no RLS SELECT policy)
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  p_project_id text,
  p_embedding vector(1536),
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid, source_id uuid, chunk_index int,
  chunk_text text, similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kc.id, kc.source_id, kc.chunk_index, kc.chunk_text,
         1 - (kc.embedding <=> p_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.project_id = p_project_id AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> p_embedding
  LIMIT p_limit;
$$;

CREATE TRIGGER set_knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Key points:
- `normalized_url` column stores the deduplicated URL for "already saved" lookups
- `SECURITY DEFINER` on the RPC so it bypasses RLS (only edge functions with service-role call it)
- Zero RLS policies = zero direct browser access

### Rollback
```sql
DROP FUNCTION IF EXISTS match_knowledge_chunks;
DROP TABLE IF EXISTS knowledge_chunks;
DROP TABLE IF EXISTS knowledge_sources;
```

---

## Phase 2: Single Edge Function (knowledge-worker)

### New: `supabase/functions/knowledge-worker/index.ts`

**verify_jwt = true** in config.toml. Only invokable by Control API using service-role key.

Two actions:

**action: "embed"**
- Input: `{ action: "embed", projectId, sourceId }`
- Creates a service-role Supabase client internally
- Reads `knowledge_sources.raw_text` for the given sourceId
- Hard caps: reject if > 500,000 chars; max 200 chunks
- Chunks: 800-1200 chars, ~100 char overlap, paragraph-aware splitting
- Embeds via OpenAI `text-embedding-3-small` in batches of 50
- Writes chunks to `knowledge_chunks` (service-role bypasses RLS)
- Updates source: `indexed = true`, `chunk_count = N`, or `index_error` on failure

**action: "search"**
- Input: `{ action: "search", projectId, query, limit? }`
- Embeds query via OpenAI
- Calls `match_knowledge_chunks` RPC (SECURITY DEFINER, so works)
- Joins source metadata (title, source_url) via service-role read
- Returns: `{ results: [{ sourceId, title, sourceUrl, chunkText }] }` (no similarity scores)

### Config addition to `supabase/config.toml`:
```toml
[functions.knowledge-worker]
verify_jwt = true
```

### How Control API calls it:
```javascript
const res = await fetch(
  `${SUPABASE_URL}/functions/v1/knowledge-worker`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, projectId, ... }),
  }
);
```

---

## Phase 3: Control API Endpoints (server/index.mjs)

Three new routes. All require `x-clawdos-project` header. All use service-role key to call Supabase/edge functions.

### POST /api/knowledge/ingest

Body: `{ title?, source_url?, source_type?, text? }`

Flow:
1. **Detect source type** from URL pattern:
   - YouTube (`youtube.com/watch`, `youtu.be`) -> `source_type: "youtube"`
   - Other URL -> `source_type: "url"`
   - No URL -> use provided `source_type` (default "note")
2. **YouTube**: Try public transcript API (oEmbed + community transcript endpoints). If unavailable: save source with `indexed: false`, `index_error: "transcript_unavailable"`, return `{ ok: true, sourceId, status: "not_indexed", reason: "transcript_unavailable" }`
3. **URL**: Fetch with 10s timeout. Extract text using junk-page heuristics:
   - Strip `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>` tags
   - Count remaining `<p>` tags: if < 3 paragraphs, likely garbage
   - If extracted text < 500 chars: reject with `{ ok: false, error: "extraction_too_short" }`
   - If suspected captcha/blocked (specific patterns): `{ ok: false, error: "page_blocked" }`
4. **Text/Note**: Accept as-is, no minimum length
5. **File (text-based)**: Accept as-is, no minimum length
6. **File (unsupported: PDF/doc/etc)**: Create source with `indexed: false`, `index_error: "unsupported_file_type"`, `raw_text: ""`. Return `{ ok: true, sourceId, status: "not_indexed", reason: "unsupported_file_type" }`
7. **Dedupe**:
   - Normalize URL: strip `utm_*`, `fbclid`, `gclid`, trailing slashes, sort query params
   - Store `normalized_url` on the source row
   - SHA-256 hash of text content -> `content_hash`
   - Check `(project_id, content_hash)`: if exists, return `{ ok: true, sourceId, wasDuplicate: true }`
8. **Store**: Insert into `knowledge_sources` via service-role
9. **Async embed**: Fire-and-forget call to `knowledge-worker` with `action: "embed"`. Do NOT await.
10. **Return immediately**: `{ ok: true, sourceId, status: "indexing" }`

### POST /api/knowledge/search

Body: `{ query, limit? }`

Proxy to `knowledge-worker` edge function with `action: "search"`. Passes service-role auth. Returns results directly.

### POST /api/health/report

Runs checks (all internal, no auth needed from outside):
1. Self-check: executor alive
2. Cron mirror: query `cron_mirror` for stale entries (updated_at > 10 min)
3. Chat delivery: check `chat_delivery_queue` for stuck items (> 5 min)
4. Drive verify: if configured for project

Formats max 5-line plain-English report, posts to war room.

---

## Phase 4: Auto-Ingestion from Knowledge Page

### `src/lib/api.ts` changes

Add two helpers:
- `searchKnowledge(query, limit?)`: calls Control API `POST /api/knowledge/search`. If Control API offline, returns empty results (not an error).
- `ingestKnowledge(opts)`: calls Control API `POST /api/knowledge/ingest`.

Modify `createNoteDocument()`:
- After successful doc creation, best-effort call `ingestKnowledge({ title, text: content, source_type: 'note' })`
- Non-blocking. Toast: "Indexing for search..." or silent fail.

Modify `uploadDocument()`:
- After upload, if file is text-based (txt, md, csv): read content, call `ingestKnowledge({ title, text, source_type: 'file' })`
- If file is PDF/doc/other: call `ingestKnowledge({ title, source_type: 'file' })` with empty text. This creates the placeholder record (`indexed: false`, `index_error: "unsupported_file_type"`).

### `src/components/pages/DocumentsPage.tsx` changes

Add a search bar above the Project Overview card:
- `Input` with search icon, debounced 500ms
- Results in a compact list: title, truncated excerpt, source type badge
- No similarity scores shown
- Empty state: "Type to search across project knowledge"
- Loading state: spinner in input

---

## Phase 5: Context Pack Integration (single canonical path)

### `supabase/functions/get-context-pack/index.ts` ONLY

When `taskId` is provided:
1. After fetching task context, call `knowledge-worker` edge function with `action: "search"` using (task title + first 200 chars of description) as query. Uses service-role auth.
2. Append top 3 results under `## Relevant Knowledge` in the markdown output.
3. Include: "Use this context and cite sources. If missing info, ingest new sources via POST /api/knowledge/ingest."

Also fetch `capabilities_version` from `project_settings` and include in header.

**No changes to `src/lib/context-pack.ts`** -- the edge function is the canonical generator.

---

## Phase 6: SOUL.md Capabilities Contract

### `supabase/functions/generate-agent-docs/index.ts`

Add to the existing "Capabilities I Can Use" bullet in SOUL_SYSTEM_PROMPT:

```
- Must include a "How to Operate Mission Control" subsection inside "Capabilities I Can Use":
  - Search knowledge: POST /api/knowledge/search { query, limit }
  - Ingest knowledge: POST /api/knowledge/ingest { title?, source_url?, source_type?, text? }
  - Propose tasks: POST /api/tasks/propose
  - Post task events: POST /api/tasks/:taskId/events
  - Upload artifacts: POST /api/drive/upload
  - All endpoints require x-clawdos-project header
  - Never use Supabase keys directly
  - If capabilities_contract provided, use it as the authoritative list instead
```

---

## Phase 7: Fallback Chain (Cron Page)

### `src/components/pages/CronPage.tsx`

Two additions (no redesign):

1. **Mirror staleness banner**: When `controlApiConnected` is false, compute max `updatedAt` across mirror jobs. If > 10 min stale, show amber warning:
   "Mirror data may be stale (last sync: X min ago). Showing last known state."

2. **Per-job "Mirror" badge**: When offline, show a small outline badge "Mirror" next to each job name.

---

## Phase 8: Capabilities Version Tracking

### In `src/lib/api.ts` -- `createAgent()`

After heartbeat cron creation, upsert `capabilities_version` in `project_settings`:
- Key: `capabilities_version`, Value: `v2025.02.15`
- Only if not already set.

---

## Files Changed Summary

| File | Change |
|------|--------|
| New migration | pgvector, knowledge_sources, knowledge_chunks, match_knowledge_chunks RPC, zero-policy RLS |
| `supabase/functions/knowledge-worker/index.ts` | New: embed + search (verify_jwt=true) |
| `supabase/config.toml` | Add knowledge-worker with verify_jwt=true |
| `server/index.mjs` | Add /api/knowledge/ingest, /api/knowledge/search, /api/health/report |
| `src/lib/api.ts` | Add searchKnowledge(), ingestKnowledge(); auto-ingest hooks; capabilities_version upsert |
| `supabase/functions/get-context-pack/index.ts` | Add knowledge search for task context; capabilities_version |
| `supabase/functions/generate-agent-docs/index.ts` | Add "How to Operate Mission Control" to SOUL prompt |
| `src/components/pages/DocumentsPage.tsx` | Search bar + results |
| `src/components/pages/CronPage.tsx` | Staleness banner + mirror badges |
| `changes.md` | Document all changes |

## New Env Vars / Secrets Required

None. All required secrets already exist:
- `OPENAI_API_KEY` -- already configured (used by knowledge-worker for embeddings)
- `SUPABASE_SERVICE_ROLE_KEY` -- already configured (used by Control API server/index.mjs)
- `SUPABASE_URL` -- already configured

## Phased Rollout

1. Phase 1: Migration (independently reversible with DROP statements)
2. Phase 2: Edge function deploy (can be deleted independently)
3. Phase 3: Control API routes (additive, no existing routes modified)
4. Phase 4: UI search + auto-ingestion (best-effort, non-blocking)
5. Phase 5-8: Context pack + SOUL prompt + fallback + versioning (all additive)

## Rollback Steps

- **Tables**: `DROP FUNCTION match_knowledge_chunks; DROP TABLE knowledge_chunks; DROP TABLE knowledge_sources;`
- **Edge function**: Delete knowledge-worker from Supabase dashboard
- **Control API**: Remove 3 route handlers from server/index.mjs; restart
- **UI**: Revert DocumentsPage search bar; revert CronPage banner
- **Auto-ingestion**: Remove best-effort calls in createNoteDocument/uploadDocument
- **SOUL prompt**: Remove "How to Operate Mission Control" subsection

Each phase is independently reversible.

