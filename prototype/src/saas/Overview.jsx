import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { useWorkspace } from "./context.jsx";
import { Card, Chip, fmtDateTime, NAVY, limitText } from "./ui.jsx";

const COMING = ["Live Meeting Capture", "AI Transcription", "Minutes & Resolution", "Follow-up Tracker", "Historical Archive", "AI Decision Support"];

export default function Overview({ goTo }) {
  const { org, plan, departments, memberCount, stages } = useWorkspace();
  const [upcoming, setUpcoming] = useState(null);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    (async () => {
      const m = await supabase.from("meetings").select("id, title, scheduled_at, mode").eq("org_id", org.id).eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: true }).limit(5);
      setUpcoming(m.data || []);
      const p = await supabase.from("agenda_items").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "pending");
      setPending(p.count ?? 0);
    })();
  }, [org.id]);

  const Stat = ({ label, value, to }) => (
    <button onClick={() => goTo(to)} className="bg-white rounded-2xl shadow-sm p-4 text-left">
      <div className="text-2xl font-serif" style={{ color: NAVY }}>{value ?? "…"}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </button>
  );

  return (
    <>
      <h1 className="font-serif text-2xl mb-1" style={{ color: NAVY }}>Welcome to {org.name}</h1>
      <p className="text-sm text-slate-500 mb-5">Approval chain: {stages.map((s) => s.name).join(" → ") || "…"}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Upcoming meetings" value={upcoming?.length} to="meetings" />
        <Stat label="Waiting for approval" value={pending} to="approvals" />
        <Stat label={`Members (limit ${limitText(plan?.max_members)})`} value={memberCount} to="members" />
        <Stat label={`Departments (limit ${limitText(plan?.max_departments)})`} value={departments.length} to="settings" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Next meetings">
          {upcoming === null ? <p className="text-sm text-slate-400">Loading…</p> : upcoming.length === 0 ? (
            <p className="text-sm text-slate-400">No upcoming meetings. <button className="underline" onClick={() => goTo("meetings")}>Schedule one</button>.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((m) => (
                <li key={m.id} className="text-sm flex justify-between gap-3"><span className="truncate" style={{ color: NAVY }}>{m.title}</span><span className="text-xs text-slate-400 shrink-0">{fmtDateTime(m.scheduled_at)}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Coming to your workspace">
          <div className="flex flex-wrap gap-2">{COMING.map((c) => <Chip key={c}>{c}</Chip>)}</div>
        </Card>
      </div>
    </>
  );
}
