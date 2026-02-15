import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Hard caps
const MAX_CHARS = 500_000;
const MAX_CHUNKS = 200;
const CHUNK_SIZE = 1000; // target
const CHUNK_OVERLAP = 100;
const EMBED_BATCH_SIZE = 50;
const EMBED_MODEL = "text-embedding-3-small";

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase service config");
  return createClient(url, key);
}

// ── Chunking ──────────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
  }

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > CHUNK_SIZE + 200 && current.length > 0) {
      chunks.push(current.trim());
      // Overlap: keep last CHUNK_OVERLAP chars
      current = current.slice(-CHUNK_OVERLAP) + "\n\n" + para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // If text had no paragraph breaks, split by sentence/size
  if (chunks.length === 1 && chunks[0].length > CHUNK_SIZE + 200) {
    const bigText = chunks[0];
    chunks.length = 0;
    for (let i = 0; i < bigText.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      chunks.push(bigText.slice(i, i + CHUNK_SIZE).trim());
    }
  }

  return chunks.slice(0, MAX_CHUNKS);
}

// ── Embedding ─────────────────────────────────────────────────────────

async function embedTexts(apiKey: string, texts: string[]): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: batch,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI embeddings error ${response.status}: ${err}`);
    }

    const data = await response.json();
    for (const item of data.data) {
      results.push(item.embedding);
    }
  }

  return results;
}

// ── Action: embed ─────────────────────────────────────────────────────

async function handleEmbed(projectId: string, sourceId: string): Promise<Response> {
  const supabase = getServiceClient();
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  // Read source
  const { data: source, error: srcErr } = await supabase
    .from("knowledge_sources")
    .select("raw_text, char_count")
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (srcErr || !source) {
    return jsonResponse({ ok: false, error: "Source not found" }, 404);
  }

  const text = source.raw_text || "";
  if (!text.trim()) {
    // Mark as not indexable
    await supabase
      .from("knowledge_sources")
      .update({ indexed: false, index_error: "empty_text" })
      .eq("id", sourceId);
    return jsonResponse({ ok: true, chunksAdded: 0, skipped: "empty_text" });
  }

  if (text.length > MAX_CHARS) {
    await supabase
      .from("knowledge_sources")
      .update({ indexed: false, index_error: `exceeds_max_chars_${MAX_CHARS}` })
      .eq("id", sourceId);
    return jsonResponse({ ok: false, error: `Text exceeds ${MAX_CHARS} chars` }, 400);
  }

  try {
    // Chunk
    const chunks = chunkText(text);

    // Embed
    const embeddings = await embedTexts(apiKey, chunks);

    // Delete existing chunks for this source (re-index)
    await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("source_id", sourceId)
      .eq("project_id", projectId);

    // Insert chunks
    const rows = chunks.map((chunk, i) => ({
      project_id: projectId,
      source_id: sourceId,
      chunk_index: i,
      chunk_text: chunk,
      // pgvector expects a numeric array (not a JSON string)
      embedding: embeddings[i],
    }));

    // Insert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error: insertErr } = await supabase
        .from("knowledge_chunks")
        .insert(batch);
      if (insertErr) throw insertErr;
    }

    // Update source
    await supabase
      .from("knowledge_sources")
      .update({
        indexed: true,
        chunk_count: chunks.length,
        index_error: null,
      })
      .eq("id", sourceId);

    return jsonResponse({ ok: true, chunksAdded: chunks.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Embed error:", msg);

    // Mark source with error
    await supabase
      .from("knowledge_sources")
      .update({ indexed: false, index_error: msg.slice(0, 500) })
      .eq("id", sourceId);

    return jsonResponse({ ok: false, error: msg }, 500);
  }
}

// ── Action: search ────────────────────────────────────────────────────

async function handleSearch(
  projectId: string,
  query: string,
  limit: number
): Promise<Response> {
  const supabase = getServiceClient();
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  // Embed query
  const [queryEmbedding] = await embedTexts(apiKey, [query]);

  // Call RPC
  const { data: matches, error: rpcErr } = await supabase.rpc(
    "match_knowledge_chunks",
    {
      p_project_id: projectId,
      // pgvector expects a numeric array (not a JSON string)
      p_embedding: queryEmbedding,
      p_limit: Math.min(limit, 20),
    }
  );

  if (rpcErr) {
    console.error("match_knowledge_chunks RPC error:", rpcErr);
    return jsonResponse({ ok: false, error: rpcErr.message }, 500);
  }

  if (!matches || matches.length === 0) {
    return jsonResponse({ ok: true, results: [] });
  }

  // Fetch source metadata for matched chunks
  const sourceIds = [...new Set(matches.map((m: any) => m.source_id))];
  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("id, title, source_url, source_type")
    .in("id", sourceIds);

  const sourceMap = new Map(
    (sources || []).map((s: any) => [s.id, s])
  );

  const results = matches.map((m: any) => {
    const src = sourceMap.get(m.source_id) || {};
    return {
      sourceId: m.source_id,
      title: (src as any).title || "Untitled",
      sourceUrl: (src as any).source_url || null,
      sourceType: (src as any).source_type || "unknown",
      chunkText: m.chunk_text,
    };
  });

  return jsonResponse({ ok: true, results });
}

// ── Helpers ───────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Main handler ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, projectId, sourceId, query, limit } = await req.json();

    if (!projectId) {
      return jsonResponse({ error: "projectId is required" }, 400);
    }

    switch (action) {
      case "embed": {
        if (!sourceId) {
          return jsonResponse({ error: "sourceId is required for embed" }, 400);
        }
        return await handleEmbed(projectId, sourceId);
      }

      case "search": {
        if (!query) {
          return jsonResponse({ error: "query is required for search" }, 400);
        }
        return await handleSearch(projectId, query, limit || 5);
      }

      default:
        return jsonResponse(
          { error: `Unknown action: ${action}. Use "embed" or "search".` },
          400
        );
    }
  } catch (err) {
    console.error("knowledge-worker error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500
    );
  }
});
