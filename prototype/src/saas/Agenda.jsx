import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { useWorkspace } from "./context.jsx";
import { Card, Button, Chip, Field, inputCls, useToast, StageTracker, fmtDateTime, NAVY } from "./ui.jsx";

export default function Agenda() {
  const { org, stages } = useWorkspace();
  const { notify, fail } = useToast();
  const [meetings, setMeetings] = useState(null);
  const [meetingId, setMeetingId] = useState("");
  const [items, setItems] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [f, setF] = useState({ title: "", description: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("meetings").select("id, title, scheduled_at, status").eq("org_id", org.id).order("scheduled_at", { ascending: false });
      if (error) return fail(error);
      const usable = (data || []).filter((m) => m.status === "scheduled");
      setMeetings(usable);
      if (usable.length && !meetingId) setMeetingId(usable[0].id);
    })();
  }, [org.id]);

  const loadItems = async (id) => {
    if (!id) return setItems([]);
    const { data, error } = await supabase.from("agenda_items").select("*").eq("meeting_id", id).order("created_at", { ascending: true });
    if (error) return fail(error);
    setItems(data || []);
    if (data?.length) {
      const d = await supabase.from("approval_decisions").select("*").in("item_id", data.map((i) => i.id));
      setDecisions(d.data || []);
    } else setDecisions([]);
  };
  useEffect(() => { loadItems(meetingId); }, [meetingId]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("agenda_items").insert({
      org_id: org.id, meeting_id: meetingId, title: f.title.trim(), description: f.description.trim() || null,
    });
    setBusy(false);
    if (error) return fail(error);
    notify("Agenda item submitted for approval.");
    setF({ title: "", description: "" });
    loadItems(meetingId);
  };

  const stageNames = stages.map((s) => s.name);
  const approvedCount = (id) => decisions.filter((d) => d.item_id === id && d.action === "approved").length;
  const rejectedAt = (id) => decisions.find((d) => d.item_id === id && d.action === "rejected");

  return (
    <>
      <h1 className="font-serif text-2xl mb-4" style={{ color: NAVY }}>Agenda</h1>

      {meetings === null ? <p className="text-sm text-slate-400">Loading…</p> : meetings.length === 0 ? (
        <Card><p className="text-sm text-slate-500">There are no scheduled meetings yet. Schedule a meeting first, then add its agenda items here.</p></Card>
      ) : (
        <>
          <Card className="mb-4">
            <Field label="Meeting">
              <select className={inputCls} value={meetingId} onChange={(e) => setMeetingId(e.target.value)}>
                {meetings.map((m) => <option key={m.id} value={m.id}>{m.title} · {fmtDateTime(m.scheduled_at)}</option>)}
              </select>
            </Field>
            <form onSubmit={add}>
              <Field label="New agenda item"><input className={inputCls} required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What should the meeting decide?" /></Field>
              <Field label="Details (optional)"><textarea className={inputCls} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
              <Button type="submit" disabled={busy || !f.title.trim()}>{busy ? "Submitting…" : "Submit for approval"}</Button>
            </form>
          </Card>

          <Card title={`Agenda items (${items.length})`}>
            {items.length === 0 ? <p className="text-sm text-slate-400">No agenda items for this meeting yet.</p> : (
              <ul className="divide-y divide-slate-100">
                {items.map((it) => (
                  <li key={it.id} className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: NAVY }}>{it.title}</span>
                      <Chip tone={it.status === "approved" ? "green" : it.status === "rejected" ? "red" : "gold"}>
                        {it.status === "pending" ? `Awaiting ${stageNames[approvedCount(it.id)] || "approval"}` : it.status === "approved" ? "Approved" : "Rejected"}
                      </Chip>
                    </div>
                    {it.description && <div className="text-xs text-slate-500 mt-0.5">{it.description}</div>}
                    <div className="text-[11px] text-slate-400 mt-0.5">Submitted by {it.submitted_by_name || "a member"}</div>
                    <div className="mt-1.5"><StageTracker stages={stageNames} approved={rejectedAt(it.id) ? rejectedAt(it.id).stage_position - 1 : approvedCount(it.id)} status={it.status} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
