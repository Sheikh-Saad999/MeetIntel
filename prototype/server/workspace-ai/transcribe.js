// Authenticated live transcription: one audio segment -> speaker-labelled lines (English + Roman Urdu).
import { op, checkAllowance, recordUsage, HttpError } from "./auth.js";
import { transcribeSegment } from "../meeting-ai/transcribe.js";

export default op(async (ctx, body, res) => {
  const seconds = Math.max(1, Math.min(600, Math.round(Number(body.seconds) || 75)));
  if (!body.audioBase64 || typeof body.audioBase64 !== "string") throw new HttpError(400, "No audio was received.");
  await checkAllowance(ctx, { seconds });
  const out = await transcribeSegment({ audioBase64: body.audioBase64, mimeType: body.mimeType, previousLines: body.previousLines });
  if (!out.ok) throw new HttpError(out.status, out.error, out.detail);
  await recordUsage(ctx, { seconds });
  return res.status(200).json({ lines: out.lines });
});
