// Shared helpers for the multi-level approval workflow.
//
// Approval chain (from the FYP proposal: Department -> Dean -> Vice Chancellor).
// An item stays Status = "Pending" until the LAST stage approves it (-> "Approved")
// or any stage rejects it (-> "Rejected"), so the existing Dashboard count and
// "Pending" filter keep working unchanged. The current stage is derived from a
// compact JSON audit log stored in ONE extra text column, "Approval Log":
//   [{ s: "HOD", a: "approved", t: "2026-10-02T09:15:00.000Z" }, ...]
// Time spent at a stage = its decision time minus the previous decision time
// (the first stage starts at the item's created_time).

export const AGENDA_ITEMS_DB_ID = "3d7d4b6a-ebb1-80b3-9512-e2d2b7e991b3";
export const STAGES = ["HOD", "Dean", "VC"];
export const LOG_PROPERTY = "Approval Log";

export const notionHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
});

export const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

export function readText(prop) {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title || []).map((t) => t.plain_text).join("");
  if (prop.type === "rich_text") return (prop.rich_text || []).map((t) => t.plain_text).join("");
  if (prop.type === "select") return prop.select?.name || "";
  return "";
}

export async function getSchema(token) {
  const res = await fetch(`https://api.notion.com/v1/databases/${AGENDA_ITEMS_DB_ID}`, {
    headers: notionHeaders(token),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Could not read Agenda Items schema");
  const map = {};
  for (const [actualName, prop] of Object.entries(data.properties || {})) {
    map[normalize(actualName)] = { actualName, type: prop.type };
  }
  return map;
}

// Adds the "Approval Log" text column if it doesn't exist yet (additive only —
// nothing existing is touched). Returns the schema entry for it.
export async function ensureLogProperty(token, schema) {
  const existing = schema[normalize(LOG_PROPERTY)];
  if (existing) return existing;
  const res = await fetch(`https://api.notion.com/v1/databases/${AGENDA_ITEMS_DB_ID}`, {
    method: "PATCH",
    headers: notionHeaders(token),
    body: JSON.stringify({ properties: { [LOG_PROPERTY]: { rich_text: {} } } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(
      new Error(
        `Could not add the "${LOG_PROPERTY}" column automatically. In Notion, open the Agenda Items database and add a Text column named exactly "${LOG_PROPERTY}".`
      ),
      { detail: data?.message }
    );
  }
  const entry = { actualName: LOG_PROPERTY, type: "rich_text" };
  schema[normalize(LOG_PROPERTY)] = entry;
  return entry;
}

export function parseLog(prop) {
  const raw = readText(prop).trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((e) => e && STAGES.includes(e.s) && (e.a === "approved" || e.a === "rejected") && e.t)
      : [];
  } catch {
    return [];
  }
}

// The stage currently holding the item, or null if it is finished.
export function currentStage(log) {
  if (log.some((e) => e.a === "rejected")) return null;
  const approved = log.filter((e) => e.a === "approved").length;
  return approved >= STAGES.length ? null : STAGES[approved];
}

export function statusProp(schema) {
  return schema["status"];
}

export async function queryAll(token, body = {}) {
  const results = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${AGENDA_ITEMS_DB_ID}/query`, {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({ page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Could not read Agenda Items");
    results.push(...(data.results || []));
    cursor = data.has_more && results.length < 500 ? data.next_cursor : null;
  } while (cursor);
  return results;
}
