// Supabase Edge Function: parse-stock-list
// Securely parses PDF, Word (.docx) or invoice images via the free Gemini API
// Deno environment running on Supabase Edge

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY is not configured in Supabase Edge Function environment variables.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const { fileBase64, mimeType, fileName } = await req.json();

    if (!fileBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: "Missing fileBase64 or mimeType in request body." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    const promptText = `
You are an expert OCR & document parser for a wholesale/retail firecracker shop stock invoice.
Analyze the provided document (${fileName || "stock list"}) and extract every firecracker product listed.

For each item, extract:
1. "name": The clean, recognizable cracker name (string, e.g., "1000 Wala Garland", "30cm Color Sparklers", "Flower Pots Big")
2. "quantity": Total units/boxes (integer number, default 1 if not specified)
3. "price": Rate or unit price in INR (number, e.g. 240, 480; 0 if missing)
4. "unit": Unit type, one of "box", "packet", or "piece" (default "box")
5. "category": Best guess category like "Sparklers", "Garlands", "Aerial Shots", "Flower Pots", "Novelty", "Chakkars", etc.

Respond with ONLY a raw JSON array matching this schema:
[
  {
    "name": "1000 Wala Garland",
    "quantity": 10,
    "price": 480,
    "unit": "box",
    "category": "Garlands"
  }
]
Do NOT include markdown backticks like \`\`\`json. Return only pure JSON array.
`;

    // Call Gemini API (Free 1.5 Flash / 2.0 Flash)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType,
                data: fileBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${errText}` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: geminiRes.status,
        }
      );
    }

    const geminiData = await geminiRes.json();
    const candidateText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    // Clean up potential backticks just in case
    const cleanedText = candidateText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsedItems = JSON.parse(cleanedText);

    return new Response(JSON.stringify({ items: parsedItems }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to parse document" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
