import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { useWorkspace } from "./context.jsx";
import { Card, Button, Chip, Field, inputCls, useToast, fmtDateTime, NAVY } from "./ui.jsx";

const MODES = ["Face-to-face", "Online", "Hybrid"];
const EMPTY = { title: "", department_id: "", scheduled_at: "", mode: "Face-to-face", chair: "", notes: "" };

export default function Meetings() {
  const { org, isAdmin, me, departments } = useWorkspace();
  const { notify, fail } = useToast();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(EMPTY);

  const load = async () => {
    const { data, error } = await supabase.from("meetings").select("*").eq("org_id", org.id).order("scheduled_at", { ascending: true });
    if (error) return fail(error);
    setRows(data);
  };
  useEffect(() => { load(); }, [org.id]);

  const deptName = (id) => departments.find((d) => d.id === id)?.name;

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("meetings").insert({
      org_id: org.id,
      title: f.title.trim(),
      department_id: f.department_id || null,
      scheduled_at: new Date(f.scheduled_at).toISOString(),
      mode: f.mode,
      chair: f.chair.trim() || null,
      notes: f.notes.trim() || null,
    });
    setBusy(false);
    if (error) return fail(error);
    notify("Meeting scheduled.");
    setF(EMPTY);
    setOpen(false);
    load();
  };

  const cancel = async (id) => {
    if (!window.confirm("Cancel this meeting?")) return;
    const { error } = await supabase.from("meetings").update({ status: "cancelled" }).eq("id", id);
    if (error) return fail(error);
    notify("Meeting cancelled.");
    load();
  };

  const now = Date.now();
  const visible = (rows || []).filter((m) => !filter || m.department_id === filter);
  const isUpcoming = (m) => m.status === "scheduled" && Date.parse(m.scheduled_at) >= now - 2 * 36e5;
  const upcoming = visible.filter(isUpcoming);
  const past = visible.filter((m) => !isUpcoming(m)).sort((a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at));

  const MeetingCard = ({ m }) => (
    <li className="py-3 flex gap-3 items-start">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm" style={{ color: NAVY }}>{m.title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{fmtDateTime(m.scheduled_at)}{m.chair ? ` · Chair: ${m.chair}` : ""}</div>
        {m.notes && <div className="text-xs text-slate-400 mt-1">{m.notes}</div>}
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          <Chip tone="brand">{deptName(m.department_id) || "Whole organization"}</Chip>
          <Chip>{m.mode}</Chip>
          {m.status === "cancelled" && <Chip tone="red">Cancelled</Chip>}
        </div>
      </div>
      {m.status === "scheduled" && (isAdmin || m.created_by === me.userId) && (
        <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => cancel(m.id)}>Cancel</button>
      )}
    </li>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-serif text-2xl" style={{ color: NAVY }}>Meetings</h1>
        <Button onClick={() => setOpen(!open)}>{open ? "Close" : "Schedule a meeting"}</Button>
      </div>

      {open && (
        <Card title="New meeting" className="mb-4">
          <form onSubmit={create}>
            <Field label="Title"><input className={inputCls} required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Quarterly quality review" /></Field>
            <div className="grid md:grid-cols-2 gap-x-4">
              <Field label="Department">
                <select className={inputCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}>
                  <option value="">Whole organization</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Date and time"><input className={inputCls} type="datetime-local" required value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} /></Field>
              <Field label="Mode">
                <select className={inputCls} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                  {MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Chair"><input className={inputCls} value={f.chair} onChange={(e) => setF({ ...f, chair: e.target.value })} placeholder="Who will chair it" /></Field>
            </div>
            <Field label="Notes / venue"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <Button type="submit" disabled={busy || !f.title.trim() || !f.scheduled_at}>{busy ? "Scheduling…" : "Schedule"}</Button>
          </form>
        </Card>
      )}

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-slate-500">Department</span>
        <select className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {rows === null ? <p className="text-sm text-slate-400">Loading…</p> : (
        <>
          <Card title={`Upcoming (${upcoming.length})`} className="mb-4">
            {upcoming.length ? <ul className="divide-y divide-slate-100">{upcoming.map((m) => <MeetingCard key={m.id} m={m} />)}</ul>
              : <p className="text-sm text-slate-400">No upcoming meetings. Use “Schedule a meeting” to add one.</p>}
          </Card>
          {past.length > 0 && (
            <Card title={`Past and cancelled (${past.length})`}>
              <ul className="divide-y divide-slate-100">{past.map((m) => <MeetingCard key={m.id} m={m} />)}</ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
