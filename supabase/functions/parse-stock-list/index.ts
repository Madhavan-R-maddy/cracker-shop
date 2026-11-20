// Supabase Edge Function: parse-stock-list
// Securely parses PDF, Word (.docx extracted text), or invoice images via the free Gemini API
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
          error: "GEMINI_API_KEY is not configured in Supabase Edge Function secrets. Please add GEMINI_API_KEY in your Supabase project dashboard.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Read Gemini model from GEMINI_MODEL secret, defaulting to gemini-2.5-flash
    const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    const body = await req.json();
    const { fileBase64, fileData, mimeType, fileName, text } = body;
    const actualBase64 = fileBase64 || fileData;

    if (!text && (!actualBase64 || !mimeType)) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required document data. Provide either 'text' (extracted from .docx/pdf/txt) or 'fileBase64'/'fileData' with 'mimeType' (for scanned PDF/images)." 
        }),
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
1. "name": The clean, recognizable cracker name (string, e.g., "1000 Wala Garland", "30cm Color Sparklers", "Flower Pots Big", "12 Shot Raider")
2. "quantity": Total units or boxes in stock (integer number, default 1 if not specified)
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

    // Construct Gemini contents array based on whether text or fileBase64 was supplied
    let contentsParts: any[] = [];

    if (text) {
      // Extracted text mode (e.g. from .docx via mammoth in browser)
      contentsParts = [
        {
          text: `${promptText}\n\n=== DOCUMENT TEXT CONTENT (${fileName || 'Word Document'}) ===\n${text}`
        }
      ];
    } else {
      // Binary file mode (PDF or images)
      contentsParts = [
        { text: promptText },
        {
          inlineData: {
            mimeType: mimeType,
            data: actualBase64,
          },
        },
      ];
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      contents: [
        {
          parts: contentsParts,
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
      let errDetail = "";
      try {
        const errJson = await geminiRes.json();
        errDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await geminiRes.text();
      }

      const returnStatus = (geminiRes.status === 429 || geminiRes.status === 503 || geminiRes.status === 504) ? geminiRes.status : 400;

      return new Response(
        JSON.stringify({
          error: `Gemini API error using model '${GEMINI_MODEL}' (${geminiRes.status}): ${errDetail}`,
          status: geminiRes.status,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: returnStatus,
        }
      );
    }

    const geminiData = await geminiRes.json();
    const candidateText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    // Clean up potential markdown formatting backticks
    const cleanedText = candidateText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsedItems = [];
    try {
      parsedItems = JSON.parse(cleanedText);
      if (!Array.isArray(parsedItems)) {
        if (parsedItems && typeof parsedItems === 'object') {
          // If Gemini wrapped items in a key like { items: [...] } or { products: [...] }
          parsedItems = parsedItems.items || parsedItems.products || parsedItems.crackers || [parsedItems];
        }
      }
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ 
          error: `Could not parse Gemini JSON output: ${cleanedText.slice(0, 300)}` 
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    return new Response(JSON.stringify({ items: parsedItems, modelUsed: GEMINI_MODEL }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Function processing error: ${err.message || String(err)}` }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
