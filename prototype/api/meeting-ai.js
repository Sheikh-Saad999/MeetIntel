// Vercel Serverless Function (single entry point for the AI meeting modules)
//
// Vercel's Hobby plan allows at most 12 serverless functions per deployment,
// so every AI module shares this one function and is selected with ?op=.
// The real logic lives in ../server/meeting-ai/ (not counted as functions).
// New modules (Minutes, Decision Support) just add an entry to OPS.
//
//   POST /api/meeting-ai?op=transcribe  -> audio segment -> transcript lines
//   GET  /api/meeting-ai?op=meetings    -> recent meetings for the picker
//   POST /api/meeting-ai?op=save        -> attach a transcript to a meeting
//   POST /api/meeting-ai?op=minutes     -> transcript/text -> draft minutes + resolution
//   POST /api/meeting-ai?op=save-minutes -> attach reviewed minutes to a meeting
//   POST /api/meeting-ai?op=livekit-token  -> mint a LiveKit token to join a video room
//   POST /api/meeting-ai?op=decision-support -> check a proposal against the Historical Archive

import transcribe from "../server/meeting-ai/transcribe.js";
import meetings from "../server/meeting-ai/meetings.js";
import save from "../server/meeting-ai/save.js";
import minutes from "../server/meeting-ai/minutes.js";
import saveMinutes from "../server/meeting-ai/save-minutes.js";
import livekitToken from "../server/meeting-ai/livekit-token.js";
import livekitDebug from "../server/meeting-ai/livekit-debug.js";
import decisionSupport from "../server/meeting-ai/decision-support.js";

export const config = { maxDuration: 60 };

const OPS = { transcribe, meetings, save, minutes, "save-minutes": saveMinutes, "livekit-token": livekitToken, "livekit-debug": livekitDebug, "decision-support": decisionSupport };

export default async function handler(req, res) {
  const op = req.query?.op;
  const fn = OPS[op];
  if (!fn) {
    return res.status(400).json({ error: "Unknown operation" });
  }
  return fn(req, res);
}
