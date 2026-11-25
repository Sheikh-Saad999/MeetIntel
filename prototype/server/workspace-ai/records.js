// Saves fields of a meeting's record (transcript / summary) without a PostgREST upsert: an upsert would
// also "update" the key columns, which the browser is deliberately not allowed to change.
import { HttpError } from "./auth.js";

export async function saveRecord(ctx, meetingId, patch) {
  const base = `/rest/v1/meeting_records`;
  const update = () =>
    ctx.json(`${base}?meeting_id=eq.${meetingId}&org_id=eq.${ctx.orgId}`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch),
    });
  let rows = await update();
  if (Array.isArray(rows) && rows.length) return;
  try {
    await ctx.json(base, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ meeting_id: meetingId, org_id: ctx.orgId, ...patch }) });
  } catch (e) {
    // someone created the record at the same moment: update it instead
    rows = await update();
    if (!(Array.isArray(rows) && rows.length)) throw new HttpError(502, "The meeting record could not be saved.", e.detail);
  }
}
