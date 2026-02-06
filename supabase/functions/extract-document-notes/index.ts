import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractionInput {
  documentId: string;
  title: string;
  content: string;
  docType: string;
}

interface ExtractionOutput {
  summary: string[];
  key_facts: string[];
  rules: string[];
  keywords: string[];
  extracted_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    
    // If no OpenAI key, skip extraction but don't fail
    if (!OPENAI_API_KEY) {
      console.log("OPENAI_API_KEY not configured, skipping extraction");
      return new Response(
        JSON.stringify({ 
          success: false, 
          reason: "no_api_key",
          notes: null 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration");
    }

    const { documentId, title, content, docType } = await req.json() as ExtractionInput;

    if (!documentId || !content) {
      return new Response(
        JSON.stringify({ error: "documentId and content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate content to avoid token limits (approx 4000 tokens ~ 16000 chars)
    const truncatedContent = content.length > 16000 
      ? content.substring(0, 16000) + "\n[... content truncated ...]"
      : content;

    // Build extraction prompt based on doc type
    const systemPrompt = buildExtractionPrompt(docType);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Document Title: ${title}\nDocument Type: ${docType}\n\n---\n\n${truncatedContent}` 
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      console.error("OpenAI error:", status, errorText);
      
      if (status === 429 || status === 402) {
        return new Response(
          JSON.stringify({ success: false, reason: "rate_limit", notes: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`OpenAI error: ${status}`);
    }

    const data = await response.json();
    const contentResult = data.choices?.[0]?.message?.content;

    if (!contentResult) {
      throw new Error("No content in response");
    }

    const parsed = JSON.parse(contentResult) as ExtractionOutput;
    
    // Add extraction timestamp
    const notes: ExtractionOutput = {
      summary: parsed.summary || [],
      key_facts: parsed.key_facts || [],
      rules: parsed.rules || [],
      keywords: parsed.keywords || [],
      extracted_at: new Date().toISOString(),
    };

    // Persist to database
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { error: updateError } = await supabase
      .from("project_documents")
      .update({ doc_notes: notes })
      .eq("id", documentId);

    if (updateError) {
      console.error("Failed to persist notes:", updateError);
      // Still return the notes even if persistence failed
    }

    return new Response(
      JSON.stringify({ success: true, notes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("extract-document-notes error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        notes: null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildExtractionPrompt(docType: string): string {
  const basePrompt = `You are extracting structured information from a document for an AI agent context system.
Your job is to produce a JSON object with these fields:

{
  "summary": ["5-10 bullet points summarizing key information"],
  "key_facts": ["Important facts, numbers, entities, definitions"],
  "rules": ["Any constraints, requirements, or 'always/never' directives"],
  "keywords": ["10-20 relevant keywords for search/matching"]
}

Guidelines:
- Be concise but complete
- Focus on actionable information
- For credentials/secrets, DO NOT include actual values - just note their existence
- Keep each bullet point under 20 words
- Extract verbatim quotes for important rules/constraints
`;

  const typeSpecific: Record<string, string> = {
    playbook: `
This is a PLAYBOOK document. Focus on:
- Step-by-step procedures
- Decision trees and conditions
- Success criteria
- Common pitfalls to avoid`,
    
    reference: `
This is a REFERENCE document. Focus on:
- Key definitions and terminology
- Important links and resources
- Version numbers and dates
- Technical specifications`,
    
    credentials: `
This is a CREDENTIALS document. CRITICAL:
- DO NOT extract actual passwords, tokens, or API keys
- Only note what credentials exist and what they're for
- Extract access instructions (not the secrets themselves)
- Note any rotation schedules or expiration info`,
    
    style_guide: `
This is a STYLE GUIDE document. Focus on:
- Voice and tone guidelines
- Do's and don'ts
- Examples of good/bad writing
- Brand-specific terminology`,
    
    general: `
This is a GENERAL document. Extract:
- Main topics and themes
- Key takeaways
- Any action items or next steps
- Important dates or deadlines`,
  };

  return basePrompt + (typeSpecific[docType] || typeSpecific.general);
}
