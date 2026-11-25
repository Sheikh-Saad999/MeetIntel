import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

// Calls one of the workspace AI operations with the signed-in user's token.
export async function callAI(op, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/workspace-ai?op=${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || "The AI request failed. Please try again."), { status: res.status, detail: out.detail });
  return out;
}

// How much of the plan's monthly AI allowance has been used.
export function useAiUsage(orgId) {
  const [usage, setUsage] = useState(null);
  const reload = useCallback(async () => {
    const { data } = await supabase.rpc("ai_usage_status", { p_org: orgId });
    if (data) setUsage(data);
  }, [orgId]);
  useEffect(() => { reload(); }, [reload]);
  return { usage, reload };
}

export const fmtClock = (s) => {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
};

// Share of speaking per person, by words (deterministic: not an AI estimate).
export function participation(lines) {
  const by = new Map();
  for (const l of lines) {
    const words = String(l.english || l.original || "").trim().split(/\s+/).filter(Boolean).length;
    const cur = by.get(l.speaker) || { speaker: l.speaker, words: 0, turns: 0 };
    cur.words += words; cur.turns += 1; by.set(l.speaker, cur);
  }
  const total = [...by.values()].reduce((n, x) => n + x.words, 0) || 1;
  return [...by.values()].sort((a, b) => b.words - a.words).map((x) => ({ ...x, share: Math.round((x.words / total) * 100) }));
}

export function minutesText(meeting, s, lines = []) {
  const out = [`MINUTES OF MEETING: ${meeting.title}`, `Date: ${new Date(meeting.scheduled_at).toLocaleString()}${meeting.chair ? `   Chair: ${meeting.chair}` : ""}`, "", "SUMMARY", s.overview];
  const block = (title, arr) => arr?.length && out.push("", title, ...arr.map((x) => `- ${x}`));
  block("KEY POINTS", s.key_points);
  block("DECISIONS", s.decisions);
  if (s.action_items?.length) out.push("", "ACTION ITEMS", ...s.action_items.map((a) => `- ${a.item}${a.owner ? ` | Owner: ${a.owner}` : ""}${a.due ? ` | Due: ${a.due}` : ""}`));
  block("CONCERNS", s.risks);
  block("OPEN QUESTIONS", s.open_questions);
  const p = participation(lines);
  if (p.length) out.push("", "PARTICIPATION", ...p.map((x) => `- ${x.speaker}: ${x.share}%`));
  return out.join("\n");
}
