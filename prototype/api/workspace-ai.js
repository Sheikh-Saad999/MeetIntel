// Vercel Serverless Function: every AI action of the company workspace (one function, many operations).
// All operations require the signed-in user's Supabase token and company membership; data is read with that
// same token, so Row Level Security keeps each company's data separate.
//
//   POST /api/workspace-ai?op=transcribe      audio segment -> transcript lines
//   POST /api/workspace-ai?op=summarize       meeting -> AI summary and insights
//   POST /api/workspace-ai?op=index-document  uploaded file -> extracted text + summary
//   POST /api/workspace-ai?op=ask             question -> answer from the company's own records

import { HttpError } from "../server/workspace-ai/auth.js";
import transcribe from "../server/workspace-ai/transcribe.js";
import summarize from "../server/workspace-ai/summarize.js";
import indexDocument from "../server/workspace-ai/documents.js";
import ask from "../server/workspace-ai/ask.js";

export const config = { maxDuration: 60 };

const OPS = { transcribe, summarize, "index-document": indexDocument, ask };

export default async function handler(req, res) {
  const fn = OPS[req.query?.op];
  if (!fn) return res.status(400).json({ error: "Unknown operation" });
  try {
    return await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, detail: err.detail });
    return res.status(500).json({ error: "Something went wrong on the server.", detail: err.message });
  }
}
