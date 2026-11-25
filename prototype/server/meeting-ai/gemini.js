// Shared Gemini caller for every AI module.
//
// Model selection: GEMINI_MODEL (if set in Vercel) is tried first, then the
// built-in defaults. A model that is unavailable to this account (404/403),
// rate-limited (429) or overloaded (503) simply falls through to the next one.

const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const FALL_THROUGH = [403, 404, 429, 503];

export function modelChain() {
  return [...new Set([process.env.GEMINI_MODEL, ...DEFAULT_MODELS].filter(Boolean))];
}

/**
 * callGemini({ parts, schema, temperature })
 *   parts:  Gemini "parts" array (text and/or inline_data)
 *   schema: Gemini responseSchema; the reply is forced to JSON
 * Returns { ok: true, text, model } or { ok: false, status, error, detail }.
 */
export async function callGemini({ parts, schema, temperature = 0.2, maxOutputTokens }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, error: "The AI service is not configured." };
  }

  let last = null;
  for (const model of modelChain()) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature,
            ...(maxOutputTokens ? { maxOutputTokens } : {}),
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      if (!text) {
        const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || "empty response";
        return { ok: false, status: 502, error: "The AI service returned no content.", detail: String(reason) };
      }
      return { ok: true, text, model };
    }

    last = { status: res.status, detail: `${model}: ${data?.error?.message || "Unknown error"}` };
    if (!FALL_THROUGH.includes(res.status)) break; // e.g. 400 is about the request, not the model
  }

  if (last.status === 429) {
    return { ok: false, status: 429, error: "The AI service is busy. Please retry shortly.", detail: last.detail };
  }
  if (last.status === 404 || last.status === 403) {
    return {
      ok: false,
      status: 502,
      error: "No AI model is available for this account.",
      detail: `${last.detail} (set GEMINI_MODEL in Vercel to a current model name)`,
    };
  }
  return { ok: false, status: 502, error: "The AI request failed.", detail: last.detail };
}

export function parseJson(text) {
  return JSON.parse(String(text).replace(/```json|```/g, "").trim());
}
