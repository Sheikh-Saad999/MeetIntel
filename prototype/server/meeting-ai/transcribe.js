// One short audio segment (16 kHz mono WAV, base64) -> speaker-labelled transcript.
// Requires GEMINI_API_KEY. The browser cuts meetings into ~75 s segments so each
// request stays under Vercel's 4.5 MB body limit.

import { callGemini, parseJson } from "./gemini.js";

const MAX_BASE64_CHARS = 4_000_000; // ~3 MB of audio

const PROMPT = `You are the transcription engine of a university meeting-management system (DHA Suffa University, Karachi). The audio is one segment of a real meeting. Speakers may mix English, Urdu and Roman Urdu.

Transcribe the audio into speaker turns and return a JSON array. Each item has:
- "speaker": "Speaker 1", "Speaker 2", ... Use a new label for each distinct voice. Never guess real names.
- "start": when the turn begins inside THIS segment, formatted M:SS.
- "original": what was said, as close to verbatim as possible. Write Urdu speech in Roman Urdu (Latin letters); keep English as English.
- "english": a faithful English rendering of the turn (identical to "original" if it was already English).

Rules:
- Transcribe ONLY speech that is clearly audible. Never produce text for background noise, music, television or distant voices, and never guess what might have been said.
- Do not invent, summarise or "improve" content.
- If there is no clearly intelligible speech, return an empty array [].
- If context from the previous segment is given below, keep speaker labels consistent with it, but do NOT repeat its lines.`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      speaker: { type: "STRING" },
      start: { type: "STRING" },
      original: { type: "STRING" },
      english: { type: "STRING" },
    },
    required: ["speaker", "start", "original", "english"],
  },
};

const isNoise = (s) => !s || /^\[?\s*(inaudible|unintelligible|noise|silence)\s*\]?\.?$/i.test(s.trim());

function clean(parsed) {
  if (!Array.isArray(parsed)) return null;
  return parsed
    .map((l) => ({
      speaker: String(l?.speaker || "Speaker 1").trim(),
      start: String(l?.start || "0:00").trim(),
      original: String(l?.original || l?.english || "").trim(),
      english: String(l?.english || l?.original || "").trim(),
    }))
    .filter((l) => !isNoise(l.english) && !isNoise(l.original));
}

/**
 * Transcribe one audio segment. Returns { ok: true, lines } or { ok: false, status, error, detail }.
 * Shared by the legacy endpoint and the authenticated workspace endpoint.
 */
export async function transcribeSegment({ audioBase64, mimeType, previousLines }) {
  if (!audioBase64 || typeof audioBase64 !== "string") return { ok: false, status: 400, error: "No audio was received." };
  if (audioBase64.length > MAX_BASE64_CHARS) return { ok: false, status: 413, error: "The audio segment is too large." };

  const context =
    Array.isArray(previousLines) && previousLines.length
      ? `\n\nContext from the previous segment (for speaker continuity only):\n${JSON.stringify(
          previousLines.slice(-4).map((l) => ({ speaker: l.speaker, english: l.english }))
        )}`
      : "";

  const result = await callGemini({
    parts: [{ text: PROMPT + context }, { inline_data: { mime_type: mimeType || "audio/wav", data: audioBase64 } }],
    schema: SCHEMA,
  });
  if (!result.ok) return { ok: false, status: result.status, error: result.error, detail: result.detail };
  let lines;
  try {
    lines = clean(parseJson(result.text));
  } catch {
    lines = null;
  }
  if (lines === null) return { ok: false, status: 502, error: "The transcription response could not be read." };
  return { ok: true, lines };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { audioBase64, mimeType, previousLines } = req.body || {};
  try {
    const out = await transcribeSegment({ audioBase64, mimeType, previousLines });
    if (!out.ok) return res.status(out.status).json({ error: out.error, detail: out.detail });
    return res.status(200).json({ lines: out.lines });
  } catch (err) {
    return res.status(500).json({ error: "Transcription failed.", detail: err.message });
  }
}
