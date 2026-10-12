// Records one decision (approve / reject) at the item's current stage.
// Approve at a non-final stage forwards it; approve at the final stage, or
// reject at any stage, finishes it (Status -> Approved / Rejected).

import {
  getSchema, ensureLogProperty, notionHeaders, parseLog, currentStage, readText, STAGES,
} from "./shared.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.NOTION_TOKEN;
  if (!token) return res.status(500).json({ error: "NOTION_TOKEN is not configured on the server" });

  const { pageId, action } = req.body || {};
  if (!pageId || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "pageId and a valid action (approve/reject) are required" });
  }

  try {
    const schema = await getSchema(token);
    const status = schema["status"];
    if (!status) return res.status(500).json({ error: "Could not find a Status property on Agenda Items" });
    const logProp = await ensureLogProperty(token, schema);

    // Read the live page so two quick clicks can't both act on a stale stage.
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: notionHeaders(token) });
    const page = await pageRes.json();
    if (!pageRes.ok) return res.status(pageRes.status).json({ error: page?.message || "Could not read the item" });

    if (readText(page.properties[status.actualName]) !== "Pending") {
      return res.status(409).json({ error: "This item has already been decided." });
    }
    const log = parseLog(page.properties[logProp.actualName]);
    const stage = currentStage(log);
    if (!stage) return res.status(409).json({ error: "This item has already been decided." });

    const entry = { s: stage, a: action === "approve" ? "approved" : "rejected", t: new Date().toISOString() };
    const nextLog = [...log, entry];
    const finished = action === "reject" || nextLog.filter((e) => e.a === "approved").length >= STAGES.length;
    const newStatus = action === "reject" ? "Rejected" : finished ? "Approved" : "Pending";

    const statusValue =
      status.type === "select" ? { select: { name: newStatus } } : { rich_text: [{ text: { content: newStatus } }] };

    const update = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: notionHeaders(token),
      body: JSON.stringify({
        properties: {
          [status.actualName]: statusValue,
          [logProp.actualName]: { rich_text: [{ text: { content: JSON.stringify(nextLog) } }] },
        },
      }),
    });
    const data = await update.json();
    if (!update.ok) return res.status(update.status).json({ error: data?.message || "Could not save the decision" });

    return res.status(200).json({
      success: true,
      stage,
      result: newStatus,
      nextStage: finished ? null : STAGES[nextLog.filter((e) => e.a === "approved").length],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, detail: err.detail });
  }
}
