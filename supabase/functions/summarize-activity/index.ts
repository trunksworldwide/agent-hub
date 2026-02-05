import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ActivityInput {
  id: string;
  type: string;
  message: string;
  actor?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const { activities, persist = true } = await req.json() as { 
      activities: ActivityInput[]; 
      persist?: boolean;
    };

    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return new Response(
        JSON.stringify({ summaries: {}, error: "No activities provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build prompt with all activities
    const activitiesText = activities
      .map((a, i) => `${i + 1}. [${a.type}] ${a.message}`)
      .join("\n");

    const systemPrompt = `You are summarizing system activity for a non-technical user.
Convert technical activity logs into simple, friendly summaries.
Keep each summary under 15 words. Be casual and clear.
Return JSON: {"1": "summary", "2": "summary", ...}`;

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
          { role: "user", content: `Summarize:\n${activitiesText}` },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded", summaries: {} }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required", summaries: {} }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("OpenAI error:", status, errorText);
      throw new Error(`OpenAI error: ${status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content in response");
    }

    const parsed = JSON.parse(content);
    
    // Map numbered responses back to activity IDs
    const summaries: Record<string, string> = {};
    activities.forEach((activity, index) => {
      const key = String(index + 1);
      if (parsed[key]) {
        summaries[activity.id] = parsed[key];
      }
    });

    // Persist summaries to database if requested
    if (persist && Object.keys(summaries).length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      if (supabaseUrl && supabaseKey) {
        for (const [id, summary] of Object.entries(summaries)) {
          try {
            await fetch(`${supabaseUrl}/rest/v1/activities?id=eq.${id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "apikey": supabaseKey,
                "Authorization": `Bearer ${supabaseKey}`,
                "Prefer": "return=minimal",
              },
              body: JSON.stringify({ summary }),
            });
          } catch (e) {
            console.error("Failed to persist summary:", e);
          }
        }
      }
    }

    return new Response(JSON.stringify({ summaries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("summarize-activity error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error", 
        summaries: {} 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
