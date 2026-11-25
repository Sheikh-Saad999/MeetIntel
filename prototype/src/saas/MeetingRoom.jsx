import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { useWorkspace } from "./context.jsx";
import { useLiveTranscript } from "./useLiveTranscript.js";
import { useAiUsage } from "./aiClient.js";
import { Chip, Button, useToast, fmtDateTime, NAVY } from "./ui.jsx";
import FilesPanel from "./meeting/FilesPanel.jsx";
import TranscriptPanel from "./meeting/TranscriptPanel.jsx";
import SummaryPanel from "./meeting/SummaryPanel.jsx";

const TABS = [["transcript", "Transcript"], ["summary", "AI summary"], ["files", "Files"]];

export default function MeetingRoom({ meetingId, goTo }) {
  const { org, isAdmin, me, departments } = useWorkspace();
  const { notify, fail } = useToast();
  const { usage, reload: reloadUsage } = useAiUsage(org.id);

  const [meeting, setMeeting] = useState(undefined);   // undefined = loading, null = not found
  const [tab, setTab] = useState("transcript");
  const [lines, setLines] = useState([]);
  const [saved, setSaved] = useState("[]");
  const [summary, setSummary] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fileCount, setFileCount] = useState(null);

  useEffect(() => {
    (async () => {
      const [m, r, f] = await Promise.all([
        supabase.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
        supabase.from("meeting_records").select("transcript, summary").eq("meeting_id", meetingId).maybeSingle(),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("meeting_id", meetingId),
      ]);
      setMeeting(m.data || null);
      const t = Array.isArray(r.data?.transcript) ? r.data.transcript : [];
      setLines(t); setSaved(JSON.stringify(t));
      setSummary(r.data?.summary || null);
      setFileCount(f.count ?? 0);
      if (r.data?.summary) setTab("summary");
    })();
  }, [meetingId]);

  const dirty = JSON.stringify(lines) !== saved;
  const linesRef = useRef(lines); linesRef.current = lines;

  const saveTranscript = async () => {
    setSaving(true);
    const snapshot = linesRef.current;
    try {
      const upd = await supabase.from("meeting_records").update({ transcript: snapshot }).eq("meeting_id", meetingId).select("meeting_id");
      if (upd.error) throw upd.error;
      if (!upd.data?.length) {
        const ins = await supabase.from("meeting_records").insert({ meeting_id: meetingId, org_id: org.id, transcript: snapshot });
        if (ins.error) throw ins.error;
      }
      setSaved(JSON.stringify(snapshot));
      notify("Transcript saved.");
    } catch (e) {
      fail(e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  };
  const ensureSaved = async () => { if (JSON.stringify(linesRef.current) !== saved) await saveTranscript(); };

  const live = useLiveTranscript({ orgId: org.id, lines, setLines, onUsage: reloadUsage });

  // save automatically once a recording has stopped and its last segment has been transcribed
  const armed = useRef(false);
  useEffect(() => { if (live.status === "recording") armed.current = true; }, [live.status]);
  useEffect(() => {
    if (armed.current && live.status === "idle" && live.pending === 0 && dirty && !saving) { armed.current = false; saveTranscript().catch(() => {}); }
  }, [live.status, live.pending, dirty]);

  useEffect(() => {
    if (!dirty && live.status !== "recording") return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, live.status]);

  if (meeting === undefined) return <p className="text-sm text-slate-400">Loading the meeting…</p>;
  if (meeting === null) return <div><button className="text-sm underline text-slate-500" onClick={() => goTo("meetings")}>← Meetings</button><p className="mt-4 text-sm text-slate-500">This meeting could not be found.</p></div>;

  const dept = departments.find((d) => d.id === meeting.department_id)?.name;
  return (
    <>
      <button className="text-xs text-slate-500 underline mb-2" onClick={() => goTo("meetings")}>← Meetings</button>
      <div className="flex items-start gap-3 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-2xl" style={{ color: NAVY }}>{meeting.title}</h1>
          <div className="text-xs text-slate-500 mt-1">{fmtDateTime(meeting.scheduled_at)}{meeting.chair ? ` · Chair: ${meeting.chair}` : ""}</div>
          <div className="flex gap-1.5 mt-2 flex-wrap"><Chip tone="brand">{dept || "Whole organization"}</Chip><Chip>{meeting.mode}</Chip>{meeting.status === "cancelled" && <Chip tone="red">Cancelled</Chip>}</div>
        </div>
        <Button kind="soft" onClick={() => goTo("ask")}>Ask AI about all meetings →</Button>
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="px-4 py-2 text-sm -mb-px border-b-2" style={tab === id ? { borderColor: NAVY, color: NAVY, fontWeight: 600 } : { borderColor: "transparent", color: "#64748B" }}>
            {label}{id === "files" && fileCount ? ` (${fileCount})` : ""}{id === "transcript" && lines.length ? ` (${lines.length})` : ""}{id === "summary" && summary ? " ✓" : ""}
          </button>
        ))}
      </div>

      <div hidden={tab !== "transcript"}>
        <TranscriptPanel lines={lines} setLines={setLines} live={live} dirty={dirty} saving={saving} onSave={() => saveTranscript().catch(() => {})} usage={usage} />
      </div>
      <div hidden={tab !== "summary"}>
        <SummaryPanel orgId={org.id} meeting={meeting} lines={lines} summary={summary} onSummary={setSummary} ensureSaved={ensureSaved} usage={usage} reloadUsage={reloadUsage} />
      </div>
      <div hidden={tab !== "files"}>
        <FilesPanel orgId={org.id} meeting={meeting} isAdmin={isAdmin} me={me} onChanged={async () => { const f = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("meeting_id", meetingId); setFileCount(f.count ?? 0); reloadUsage(); }} />
      </div>
    </>
  );
}
