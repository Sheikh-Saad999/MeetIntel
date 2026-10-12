// Vercel Serverless Function (single entry point for Approval Routing)
//
// Replaces get-pending-agenda-items.js and update-agenda-status.js so the
// project stays well under Vercel's 12-function limit on the Hobby plan.
// The logic lives in ../server/approvals/ (not counted as functions).
//
//   GET  /api/approvals?op=pending    -> items awaiting a decision (+ stage, wait time)
//   POST /api/approvals?op=decide     -> approve/reject at the item's current stage
//   GET  /api/approvals?op=analytics  -> per-stage timing + bottleneck

import pending from "../server/approvals/pending.js";
import decide from "../server/approvals/decide.js";
import analytics from "../server/approvals/analytics.js";

const OPS = { pending, decide, analytics };

export default async function handler(req, res) {
  const fn = OPS[req.query?.op];
  if (!fn) return res.status(400).json({ error: "Unknown operation" });
  return fn(req, res);
}
