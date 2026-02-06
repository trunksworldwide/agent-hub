import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { format } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Hard limits to keep context windows small
const MAX_PINNED_DOCS = 10;
const MAX_RECENT_ACTIVITIES = 20;
const MAX_SUMMARY_BULLETS = 10;

interface DocReference {
  id: string;
  title: string;
  docType: string;
  notes: string[];
  rules: string[];
  isCredential: boolean;
}

interface ContextPack {
  builtAt: string;
  projectId: string;
  agentKey: string;
  projectOverview: string;
  globalDocs: DocReference[];
  agentDocs: DocReference[];
  recentChanges: string;
  taskContext?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { projectId, agentKey, taskId } = await req.json() as {
      projectId: string;
      agentKey: string;
      taskId?: string;
    };

    if (!projectId || !agentKey) {
      return new Response(
        JSON.stringify({ error: "projectId and agentKey are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all data in parallel
    const [projectOverview, globalDocs, agentDocs, recentChanges, taskContext] = await Promise.all([
      fetchProjectOverview(supabase, projectId),
      fetchPinnedDocs(supabase, projectId, null),
      fetchPinnedDocs(supabase, projectId, agentKey),
      generateRecentChanges(supabase, projectId),
      taskId ? fetchTaskContext(supabase, projectId, taskId) : Promise.resolve(undefined),
    ]);

    const contextPack: ContextPack = {
      builtAt: new Date().toISOString(),
      projectId,
      agentKey,
      projectOverview,
      globalDocs,
      agentDocs,
      recentChanges,
      taskContext,
    };

    // Also return as markdown for direct use
    const markdown = renderContextPackAsMarkdown(contextPack);

    return new Response(
      JSON.stringify({ contextPack, markdown }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-context-pack error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchProjectOverview(supabase: any, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from("brain_docs")
    .select("content")
    .eq("project_id", projectId)
    .eq("doc_type", "project_overview")
    .is("agent_key", null)
    .maybeSingle();

  if (error) {
    console.error("fetchProjectOverview error:", error);
    return "_Failed to load project overview._";
  }

  return data?.content?.trim() || "_No project overview set._";
}

async function fetchPinnedDocs(
  supabase: any,
  projectId: string,
  agentKey: string | null
): Promise<DocReference[]> {
  let query = supabase
    .from("project_documents")
    .select("id, title, doc_type, sensitivity, doc_notes")
    .eq("project_id", projectId)
    .eq("pinned", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_PINNED_DOCS);

  if (agentKey === null) {
    query = query.is("agent_key", null);
  } else {
    query = query.eq("agent_key", agentKey);
  }

  const { data, error } = await query;

  if (error) {
    console.error("fetchPinnedDocs error:", error);
    return [];
  }

  return (data || []).map((d: any) => {
    const notes = d.doc_notes as any;
    const isCredential = d.sensitivity === "contains_secrets";

    let summaryBullets: string[] = [];
    let rulesList: string[] = [];

    if (notes && !isCredential) {
      summaryBullets = Array.isArray(notes.summary)
        ? notes.summary.slice(0, MAX_SUMMARY_BULLETS)
        : [];
      rulesList = Array.isArray(notes.rules) ? notes.rules : [];
    }

    return {
      id: d.id,
      title: d.title,
      docType: d.doc_type || "general",
      notes: summaryBullets,
      rules: rulesList,
      isCredential,
    };
  });
}

async function generateRecentChanges(supabase: any, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from("activities")
    .select("type, message, actor_agent_key, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(MAX_RECENT_ACTIVITIES);

  if (error) {
    console.error("generateRecentChanges error:", error);
    return "_Failed to load recent changes._";
  }

  if (!data || data.length === 0) {
    return "_No recent activity._";
  }

  const lines = data.map((item: any) => {
    const time = format(new Date(item.created_at), "HH:mm");
    const actor = item.actor_agent_key || "system";
    return `- [${time}] ${item.message} _(${actor})_`;
  });

  return lines.join("\\n");
}

async function fetchTaskContext(
  supabase: any,
  projectId: string,
  taskId: string
): Promise<string | undefined> {
  const [taskRes, commentsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("title, description, status")
      .eq("id", taskId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("task_comments")
      .select("content, author_agent_key, created_at")
      .eq("task_id", taskId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (taskRes.error || !taskRes.data) return undefined;

  const task = taskRes.data;
  const comments = commentsRes.data || [];

  let context = `## Current Task: ${task.title}\\n`;
  context += `Status: ${task.status}\\n`;

  if (task.description) {
    context += `\\n${task.description}\\n`;
  }

  if (comments.length > 0) {
    context += "\\n### Recent Discussion\\n";
    for (const c of comments) {
      const author = c.author_agent_key || "user";
      context += `- **${author}**: ${c.content}\\n`;
    }
  }

  return context;
}

function renderContextPackAsMarkdown(pack: ContextPack): string {
  const lines: string[] = [];

  lines.push(`# Context Pack`);
  lines.push(`Built: ${pack.builtAt}`);
  lines.push(`Agent: ${pack.agentKey}`);
  lines.push("");

  lines.push("## Project Overview");
  lines.push(pack.projectOverview);
  lines.push("");

  lines.push("## Recent Changes");
  lines.push(pack.recentChanges);
  lines.push("");

  if (pack.globalDocs.length > 0) {
    lines.push("## Global Knowledge");
    for (const doc of pack.globalDocs) {
      lines.push(`### ${doc.title} (${doc.docType})`);
      if (doc.isCredential) {
        lines.push("_Contains credentials — see document for details_");
      } else {
        if (doc.notes.length > 0) {
          for (const note of doc.notes) {
            lines.push(`- ${note}`);
          }
        }
        if (doc.rules.length > 0) {
          lines.push("**Rules:**");
          for (const rule of doc.rules) {
            lines.push(`- ${rule}`);
          }
        }
        if (doc.notes.length === 0 && doc.rules.length === 0) {
          lines.push("_No extracted notes yet._");
        }
      }
      lines.push("");
    }
  }

  if (pack.agentDocs.length > 0) {
    lines.push("## Your Knowledge");
    for (const doc of pack.agentDocs) {
      lines.push(`### ${doc.title} (${doc.docType})`);
      if (doc.isCredential) {
        lines.push("_Contains credentials — see document for details_");
      } else {
        if (doc.notes.length > 0) {
          for (const note of doc.notes) {
            lines.push(`- ${note}`);
          }
        }
        if (doc.rules.length > 0) {
          lines.push("**Rules:**");
          for (const rule of doc.rules) {
            lines.push(`- ${rule}`);
          }
        }
        if (doc.notes.length === 0 && doc.rules.length === 0) {
          lines.push("_No extracted notes yet._");
        }
      }
      lines.push("");
    }
  }

  if (pack.taskContext) {
    lines.push(pack.taskContext);
    lines.push("");
  }

  return lines.join("\\n");
}
