// Authentication + tenant isolation for the workspace AI endpoints.
//
// The browser sends the signed-in user's Supabase access token. Every database and storage request made
// here carries THAT token (never a service key), so Row Level Security applies exactly as it does in the
// browser: even a bug in this server code cannot read another company's data.

export class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID.test(v);

const cfg = () => ({
  url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, ""),
  key: (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim(),
});

export async function authenticate(req, orgId) {
  const { url, key } = cfg();
  if (!url || !key) throw new HttpError(500, "The server is not connected to the database.");
  const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "Please sign in again.");
  if (!isUuid(orgId)) throw new HttpError(400, "A valid company is required.");

  const raw = (path, init = {}) =>
    fetch(`${url}${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });

  const who = await raw("/auth/v1/user");
  if (!who.ok) throw new HttpError(401, "Your session has expired. Please sign in again.");
  const user = await who.json();

  const mem = await raw(`/rest/v1/memberships?select=role&org_id=eq.${orgId}&user_id=eq.${user.id}`);
  const rows = mem.ok ? await mem.json() : [];
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(403, "You are not a member of this company.");

  // JSON helper: throws a clean error when the database refuses (which is what RLS does to outsiders)
  const json = async (path, init) => {
    const r = await raw(path, init);
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new HttpError(r.status === 401 || r.status === 403 ? 403 : 502, "The database request failed.", data?.message);
    return data;
  };
  const rpc = (name, args) => json(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });

  return { orgId, user, role: rows[0].role, raw, json, rpc };
}

// ---- plan allowance: check before the AI call, record after it succeeds ----
export async function checkAllowance(ctx, { queries = 0, seconds = 0 }) {
  const st = await ctx.rpc("ai_usage_status", { p_org: ctx.orgId });
  if (queries && st.queries_limit != null && st.queries_used + queries > st.queries_limit) {
    throw new HttpError(402, `Your plan's monthly AI limit (${st.queries_limit} actions) has been reached. Upgrade the plan to continue.`);
  }
  if (seconds && st.seconds_limit != null && st.seconds_used + seconds > st.seconds_limit) {
    throw new HttpError(402, `Your plan's monthly transcription limit (${Math.round(st.seconds_limit / 60)} minutes) has been reached. Upgrade the plan to continue.`);
  }
  return st;
}

export async function recordUsage(ctx, { queries = 0, seconds = 0 }) {
  try {
    return await ctx.rpc("consume_ai", { p_org: ctx.orgId, p_queries: queries, p_seconds: Math.min(600, Math.round(seconds)) });
  } catch (e) {
    // the AI work is already done; never fail the user's request over bookkeeping
    return null;
  }
}

// POST-only JSON handler wrapper shared by every op
export function op(fn) {
  return async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const body = req.body || {};
    const ctx = await authenticate(req, body.orgId);
    return fn(ctx, body, res);
  };
}
