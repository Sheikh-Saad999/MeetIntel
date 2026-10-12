import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, CalendarClock, ListTree, GitBranch, Video, Mic,
  FileSignature, ClipboardCheck, Archive, Sparkles, Network, Cpu, Search,
  CheckCircle2, XCircle, Clock3, ChevronRight, Circle, PlayCircle, Send, MessageSquare,
  ShieldCheck, Building2, Landmark, Paperclip, Ban, Volume2, Workflow, DollarSign,
  Mail, ListChecks, Square, Video as VideoIcon, VideoOff, MicOff, PhoneOff
} from "lucide-react";
import { CaptureProvider, useCapture } from "./CaptureContext.jsx";

const NAVY = "#81181C";
const SLATE = "#6B4A42";
const GOLD = "#FAB717";
const BG = "#FBF7F2";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "orgstructure", label: "University Hierarchy", icon: Landmark },
  { id: "scheduling", label: "01 · Meeting Scheduling", icon: CalendarClock },
  { id: "agenda", label: "02 · Agenda Builder", icon: ListTree },
  { id: "approval", label: "03 · Approval Routing", icon: GitBranch },
  { id: "capture", label: "04 · Live Meeting Capture", icon: Video },
  { id: "transcription", label: "05 · AI Transcription", icon: Mic },
  { id: "minutes", label: "06 · Minutes & Resolution", icon: FileSignature },
  { id: "followup", label: "07 · Follow-up Tracker", icon: ClipboardCheck },
  { id: "archive", label: "08 · Historical Archive", icon: Archive },
  { id: "insights", label: "09 · AI Decision Support", icon: Sparkles },
];

function Chip({ children, tone = "slate" }) {
  const tones = {
    slate: { bg: "#F3E4D6", fg: SLATE },
    gold: { bg: "#F6EFDC", fg: "#8A6D1F" },
    green: { bg: "#E4F2EA", fg: "#2E7D5B" },
    red: { bg: "#FBE9E7", fg: "#B23A2E" },
  };
  const t = tones[tone];
  return (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: t.bg, color: t.fg }}
    >
      {children}
    </span>
  );
}

function Card({ title, eyebrow, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 ${className}`}>
      {eyebrow && (
        <div className="text-[11px] tracking-widest uppercase font-semibold mb-1" style={{ color: SLATE }}>
          {eyebrow}
        </div>
      )}
      {title && <h3 className="font-serif text-lg mb-3" style={{ color: NAVY }}>{title}</h3>}
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, desc }) {
  return (
    <div className="mb-6">
      <div className="text-xs tracking-widest uppercase font-semibold mb-1" style={{ color: GOLD }}>{eyebrow}</div>
      <h2 className="font-serif text-2xl md:text-3xl" style={{ color: NAVY }}>{title}</h2>
      {desc && <p className="text-slate-500 mt-2 max-w-2xl text-sm leading-relaxed">{desc}</p>}
    </div>
  );
}

/* ---------- Screens ---------- */

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const bars = [40, 65, 50, 80, 60, 95, 70];

  useEffect(() => {
    fetch("/api/get-dashboard-stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.stats) setStats(data.stats);
        if (data.events) setEvents(data.events);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    ["Meetings scheduled", stats?.activeMeetings, "green"],
    ["Pending approvals", stats?.pendingApprovals, "gold"],
    ["Resolutions archived", stats?.resolutions, "slate"],
    ["Open action items", stats?.openFollowups, "slate"],
  ];

  return (
    <>
      <SectionHeader eyebrow="Overview" title="Governance Dashboard" desc="Live snapshot of meetings, approvals and resolutions across every faculty and department." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map(([label, val]) => (
          <Card key={label}>
            <div className="text-3xl font-serif" style={{ color: NAVY }}>{loading ? "—" : val ?? 0}</div>
            <div className="text-xs text-slate-500 mt-1">{label}</div>
          </Card>
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Meetings per month" className="md:col-span-2">
          <div className="flex items-end gap-3 h-36">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-t-md" style={{ height: `${h}%`, background: i === 5 ? GOLD : SLATE, opacity: i === 5 ? 1 : 0.75 }} />
                <span className="text-[10px] text-slate-400">{["Feb","Mar","Apr","May","Jun","Jul","Aug"][i]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recent activity">
          {loading && <p className="text-sm text-slate-400">Loading…</p>}
          {!loading && events.length === 0 && <p className="text-sm text-slate-400">No activity yet.</p>}
          <ul className="space-y-3 text-sm">
            {events.map((e, i) => (
              <li key={i} className="flex gap-2">
                <Circle size={8} className="mt-1.5 shrink-0" style={{ color: GOLD }} fill={GOLD} />
                <div>
                  <div className="text-slate-700">{e.text}</div>
                  <div className="text-[11px] text-slate-400">{timeAgo(e.time)}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="mt-4">
        <PipelineAnalytics />
      </div>
    </>
  );
}

function OrgStructure() {
  const bof = [
    ["Board of Faculty — Engineering & Applied Sciences", [
      ["BE", ["Mechanical Engineering", "Electrical Engineering"]],
      ["BS", ["Computer Engineering Technology"]],
      ["ME (Evening/Weekend)", ["Mechanical Engineering", "Electrical Engineering"]],
      ["PhD (Evening/Weekend)", ["Mechanical Engineering", "Electrical Engineering"]],
    ]],
    ["Board of Faculty — Computing & Information Technology", [
      ["BS", ["Computer Science", "Software Engineering", "Data Science", "Artificial Intelligence", "Cyber Security", "Computer Engineering", "Multimedia and Gaming"]],
      ["MS (Evening/Weekend)", ["Computer Science"]],
      ["PhD (Evening/Weekend)", ["Computer Science"]],
    ]],
    ["Board of Faculty — Management Sciences", [
      ["BBA (4 Years/2.5 Years after ADP)", ["Finance/HRM/Marketing/SCM"]],
      ["Associate Degree", ["Business Administration", "Accounting & Finance", "Business Analytics & Programming"]],
      ["MBA (Evening/Weekend)", ["Finance/HRM/Marketing/SCM/Business Analytics"]],
      ["BS", ["Business Analytics and Programming", "Accounting and Finance", "FinTech"]],
      ["MS (Evening/Weekend)", ["Management Sciences"]],
      ["PhD (Evening/Weekend)", ["Management Sciences"]],
    ]],
    ["Board of Faculty — Humanities & Social Sciences", [
      ["BS", ["Psychology", "International Relations", "English"]],
      ["MPhil", ["Psychology", "International Relations"]],
    ]],
  ];
  return (
    <>
      <SectionHeader eyebrow="DHA Suffa University · Main Campus" title="University Organizational Structure" desc="Academic Council → Board of Faculty → Department → Program — the governance hierarchy every meeting and approval in MeetIntel is routed through." />
      <Card>
        <div className="rounded-lg px-4 py-2.5 font-medium text-white text-sm mb-3" style={{ background: NAVY }}>Academic Council</div>
        <div className="space-y-3">
          {bof.map(([name, depts]) => (
            <div key={name} className="ml-4 rounded-lg border p-3" style={{ borderColor: SLATE }}>
              <div className="text-sm font-medium mb-2" style={{ color: SLATE }}>{name}</div>
              <div className="ml-4 space-y-2">
                {depts.map(([dept, programs]) => (
                  <div key={dept}>
                    <div className="text-xs font-medium text-slate-400 mb-1">{dept}</div>
                    <div className="flex flex-wrap gap-2">
                      {programs.map(p => <Chip key={p}>{p}</Chip>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SectionHeader eyebrow="Governance" title="Role-Based Permissions" desc="What each role can do at each stage of the meeting and approval workflow." />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="pb-2">Role</th><th className="pb-2">Scope</th><th className="pb-2 text-center">Approve</th><th className="pb-2 text-center">Route</th><th className="pb-2 text-center">Final</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Vice Chancellor", "Final approval authority", true, true, true],
              ["Dean", "Faculty-level review & comments", true, true, false],
              ["HOD", "Schedules meetings, sets agenda", true, false, false],
              ["Faculty / BOS member", "Attends, comments, votes", false, false, false],
            ].map(([r, s, a, ro, f]) => (
              <tr key={r} className="border-t border-slate-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>{r}</td>
                <td className="py-2 text-slate-500">{s}</td>
                <td className="py-2 text-center">{a ? <CheckCircle2 size={16} className="inline text-emerald-600" /> : "—"}</td>
                <td className="py-2 text-center">{ro ? <CheckCircle2 size={16} className="inline text-emerald-600" /> : "—"}</td>
                <td className="py-2 text-center">{f ? <CheckCircle2 size={16} className="inline text-emerald-600" /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
        <Landmark size={14} className="mt-0.5 shrink-0" style={{ color: SLATE }} />
        Reflects DHA Suffa University's official faculty, department, and program structure at the Main Campus.
      </div>
    </>
  );
}

function Scheduling() {
  const [form, setForm] = useState({
    name: "Board of Studies — BBA Program",
    type: "Board of Studies",
    date: "",
    mode: "Online",
    chair: "",
  });
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [meetings, setMeetings] = useState([
    ["Board of Studies — BBA", "28 Jul, 11:00 AM", "Online"],
    ["Faculty Board — Humanities", "02 Aug, 2:00 PM", "Face-to-face"],
    ["HOD Sync — Mgmt Sciences", "05 Aug, 10:00 AM", "Online"],
  ]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submitMeeting = async () => {
    if (!form.name.trim() || !form.date.trim()) {
      setStatus("error");
      setErrorMsg("Meeting name and date & time are required.");
      return;
    }
    setStatus("saving");
    setErrorMsg("");
    try {
      const res = await fetch("/api/create-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          date: form.date,
          venueMode: form.mode,
          chair: form.chair,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Failed to create meeting");
      setMeetings([[form.name, form.date, form.mode], ...meetings]);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  };

  return (
    <>
      <SectionHeader eyebrow="Module 01" title="Meeting Scheduling" desc="Any authorized convener proposes a meeting; invitees are notified automatically by email the moment it's created." />
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="New meeting">
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs text-slate-400">Meeting type</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none"
                value={form.name}
                onChange={update("name")}
                placeholder="e.g. Board of Studies — BBA Program"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Date & time</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none"
                  value={form.date}
                  onChange={update("date")}
                  placeholder="28 Jul 2026 · 11:00 AM"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Mode</label>
                <div className="mt-1 flex gap-2">
                  {["Face-to-face", "Online"].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm({ ...form, mode: m })}
                      className="text-left"
                    >
                      <Chip tone={form.mode === m ? "green" : "slate"}>{m}</Chip>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400">Chair</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none"
                value={form.chair}
                onChange={update("chair")}
                placeholder="e.g. Dean, Mgmt Sciences"
              />
            </div>
            <button
              onClick={submitMeeting}
              disabled={status === "saving"}
              className="mt-2 w-full rounded-lg text-white text-sm py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: NAVY }}
            >
              <Send size={14} />
              {status === "saving" ? "Saving…" : "Create meeting"}
            </button>
            {status === "success" && (
              <div className="mt-3 rounded-lg border p-3 text-xs" style={{ borderColor: "#EFD9BE", background: "#FBF3E9", color: SLATE }}>
                Meeting created successfully.
              </div>
            )}
            {status === "error" && (
              <div className="mt-3 rounded-lg border p-3 text-xs" style={{ borderColor: "#F3C9C2", background: "#FBE9E7", color: "#B23A2E" }}>
                {errorMsg}
              </div>
            )}
          </div>
        </Card>
        <Card title="Upcoming meetings">
          <ul className="divide-y divide-slate-100 text-sm">
            {meetings.map(([t, d, m]) => (
              <li key={t + d} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium" style={{ color: NAVY }}>{t}</div>
                  <div className="text-xs text-slate-400">{d}</div>
                </div>
                <Chip tone={m === "Online" ? "green" : "slate"}>{m}</Chip>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function AgendaBuilder() {
  const initialItems = [
    { item: "Review of BBA internship policy — mandatory vs. optional", by: "Azam Khan", comment: "Industry partners support a mandatory model.", file: "internship_survey.pdf", status: "approved" },
    { item: "Update on Fall 2026 admissions criteria", by: "Dr. Sana", comment: "Need updated cut-off marks before vote.", file: "admissions_2026.xlsx", status: "approved" },
    { item: "Approval of new elective: Digital Marketing Analytics", by: "HOD, BBA", comment: null, file: "course_outline.docx", status: "approved" },
    { item: "Request to shift Thursday lab slot to Friday", by: "Junaid Ali", comment: "Overlaps with another course.", file: "timetable_clip.mp3", status: "rejected" },
  ];
  const [items, setItems] = useState(initialItems);
  const [form, setForm] = useState({ item: "", by: "", meeting: "BOS - BBA Program", comment: "" });
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submitItem = async () => {
    if (!form.item.trim() || !form.by.trim()) {
      setStatus("error");
      setErrorMsg("Item title and your name are required.");
      return;
    }
    setStatus("saving");
    setErrorMsg("");
    try {
      const res = await fetch("/api/create-agenda-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: form.item,
          submittedBy: form.by,
          meeting: form.meeting,
          comment: form.comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Failed to submit agenda item");
      setItems([{ item: form.item, by: form.by, comment: form.comment || null, file: "", status: "approved" }, ...items]);
      setForm({ item: "", by: "", meeting: form.meeting, comment: "" });
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message);
    }
  };

  const statusTone = s => s === "approved" ? "green" : "red";
  return (
    <>
      <SectionHeader eyebrow="Module 02" title="Agenda Builder" desc="Members submit items with attachments into a shared pool; the chair reviews and filters before the agenda is finalized." />
      <Card title="Submit a new agenda item" className="mb-4">
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-slate-400">Item title</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none"
              value={form.item}
              onChange={update("item")}
              placeholder="e.g. Approval of new elective course"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400">Your name</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none"
                value={form.by}
                onChange={update("by")}
                placeholder="e.g. Dr. Sana Malik"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Meeting</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none"
                value={form.meeting}
                onChange={update("meeting")}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400">Comment (optional)</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none"
              value={form.comment}
              onChange={update("comment")}
            />
          </div>
          <button
            onClick={submitItem}
            disabled={status === "saving"}
            className="mt-1 w-full rounded-lg text-white text-sm py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: NAVY }}
          >
            <Send size={14} />
            {status === "saving" ? "Saving…" : "Submit agenda item"}
          </button>
          {status === "success" && (
            <div className="mt-1 rounded-lg border p-3 text-xs" style={{ borderColor: "#EFD9BE", background: "#FBF3E9", color: SLATE }}>
              Agenda item submitted successfully.
            </div>
          )}
          {status === "error" && (
            <div className="mt-1 rounded-lg border p-3 text-xs" style={{ borderColor: "#F3C9C2", background: "#FBE9E7", color: "#B23A2E" }}>
              {errorMsg}
            </div>
          )}
        </div>
      </Card>
      <Card title="Submitted items — pending chair review">
        <div className="space-y-4">
          {items.map((it, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5" style={{ background: "#F3E4D6", color: SLATE }}>{i + 1}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: NAVY }}>{it.item}</span>
                  <Chip tone={statusTone(it.status)}>{it.status === "approved" ? "Approved by chair" : "Rejected"}</Chip>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Submitted by {it.by}</div>
                {it.comment && (
                  <div className="mt-1.5 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                    <MessageSquare size={12} className="mt-0.5 shrink-0 text-slate-400" />
                    {it.comment}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function ProcessFlow() {
  const steps = [
    ["Call for meeting", "Convener/Chair", "Initiates meeting, selects committee & invitees."],
    ["Agenda item submission", "Invited members", "Each member submits items + attachments into a shared pool."],
    ["Agenda review & filtering", "Chair", "Chair approves, edits, or removes items — final say on the agenda."],
    ["Finalization & distribution", "System", "Final agenda + date/time/venue auto-pushed to all participants."],
    ["Assembly & attendance", "All participants", "Members gather at venue or join online; attendance logged automatically."],
    ["Meeting initiation", "Chair", "Chair opens session; recording starts for in-room + remote attendees."],
    ["Agenda item defense", "Item owner", "Owner presents/defends item; can say \"read line number 3\" to the AI."],
    ["Speaker recognition", "AI engine", "Detects who is speaking, like Zoom's active-speaker view."],
    ["Live transcription & translation", "AI engine", "Speech-to-text in real time, mixed languages normalized into one transcript."],
    ["Decision + AI-assisted support", "Chair + AI", "Chair records the decision; AI flags related past resolutions & insights."],
    ["Minutes of Meeting generated", "AI engine", "Attendance, discussion, decisions compiled into a structured MoM."],
    ["Archive & follow-up", "System", "MoM archived permanently; open items auto-carried to next meeting."],
  ];
  return (
    <>
      <SectionHeader eyebrow="System design" title="Meeting Lifecycle — Process Flow" desc="Exactly how one meeting moves through MeetIntel, end to end." />
      <div className="space-y-2">
        {steps.map(([title, actor, desc], i) => (
          <div key={title} className="flex gap-3 items-start bg-white rounded-lg border border-slate-200 p-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0" style={{ background: i === 6 || i === 7 ? GOLD : SLATE }}>{i + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm" style={{ color: NAVY }}>{title}</span>
                <Chip tone="slate">{actor}</Chip>
              </div>
              <div className="text-xs text-slate-500 mt-1">{desc}</div>
            </div>
            {(i === 6) && <Volume2 size={16} className="shrink-0 mt-1" style={{ color: GOLD }} />}
          </div>
        ))}
      </div>
    </>
  );
}

function BusinessModel() {
  const rows = [
    ["Value Proposition", "Replaces fragmented, manual meeting/approval documentation with one AI-powered system of record."],
    ["Customer Segments", "Universities & higher-ed bodies (Academic Council, BOF, HOD/BOS committees); extendable to corporate boards."],
    ["Revenue Streams", "Tiered annual SaaS subscription — illustrative start: $7,000/year per institution, scaled by depts, storage, AI usage."],
    ["Channels", "Direct sales to university administrations, higher-ed tech expos, academic partner referrals."],
    ["Key Resources", "n8n workflows, AI transcription/translation & LLM APIs, Notion knowledge base, cloud infrastructure."],
    ["Cost Structure", "Cloud hosting/storage, third-party AI/API usage, n8n Cloud or self-hosting, support & onboarding."],
    ["Competitive Edge", "Purpose-built for academic governance hierarchies — AI-native, not transcription bolted on afterward."],
  ];
  return (
    <>
      <SectionHeader eyebrow="Module 11" title="Business Model" desc="How MeetIntel is positioned and monetized as a SaaS product." />
      <div className="grid md:grid-cols-2 gap-4">
        {rows.map(([t, d]) => (
          <Card key={t} title={t}><p className="text-xs text-slate-500 leading-relaxed">{d}</p></Card>
        ))}
      </div>
    </>
  );
}

const fmtHours = (h) => {
  if (!h || h < 1 / 60) return "<1m";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

const apiError = (data, fallback) =>
  (typeof data?.error === "string" ? data.error : data?.error?.message) || fallback;

function PipelineAnalytics({ refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let alive = true;
    fetch("/api/approvals?op=analytics")
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (!ok) throw new Error();
        setData(body);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [refreshKey]);

  const stages = data?.stages || [];
  const hasData = stages.some((s) => s.decisions + s.pending > 0);
  const maxAvg = Math.max(1, ...stages.map((s) => s.avgHours));

  return (
    <Card title="Approval pipeline — time spent at each stage">
      {state === "loading" && <p className="text-sm text-slate-400">Loading…</p>}
      {state === "error" && <p className="text-sm text-slate-400">Pipeline analytics are unavailable right now.</p>}
      {state === "ready" && !hasData && (
        <p className="text-sm text-slate-400">No approval activity yet. Timing appears here once items start moving through the approval chain.</p>
      )}
      {state === "ready" && hasData && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <Chip tone="slate">{data.totals.items} items</Chip>
            <Chip tone="gold">{data.totals.pending} pending</Chip>
            <Chip tone="green">{data.totals.approved} approved</Chip>
            <Chip tone="red">{data.totals.rejected} rejected</Chip>
          </div>
          <div className="space-y-3">
            {stages.map((s) => {
              const isBottleneck = data.bottleneck === s.stage;
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium flex items-center gap-2" style={{ color: NAVY }}>
                      {s.stage}
                      {isBottleneck && <Chip tone="red">Bottleneck</Chip>}
                    </span>
                    <span className="text-slate-400">
                      {s.decisions + s.pending === 0
                        ? "no data yet"
                        : `avg ${fmtHours(s.avgHours)} · ${s.decisions} decided · ${s.pending} waiting`}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.decisions + s.pending ? Math.max(4, (s.avgHours / maxAvg) * 100) : 0}%`,
                        background: isBottleneck ? "#C0392B" : SLATE,
                        opacity: isBottleneck ? 1 : 0.7,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            Average includes decisions already made and the time pending items have waited so far.
          </p>
          {data.longestWaiting.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="text-xs font-medium mb-2" style={{ color: NAVY }}>Longest waiting right now</div>
              <ul className="space-y-1.5">
                {data.longestWaiting.map((w) => (
                  <li key={w.id} className="flex justify-between gap-3 text-xs text-slate-600">
                    <span className="truncate">{w.title || "Untitled item"} <span className="text-slate-400">· at {w.stage}</span></span>
                    <span className="shrink-0 font-medium">{fmtHours(w.waitingHours)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function StageTracker({ stages, index }) {
  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {stages.map((s, i) => {
        const done = i < index;
        const current = i === index;
        return (
          <React.Fragment key={s}>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{
                background: done ? "#E4F2EA" : current ? "#F6EFDC" : "#F1F5F9",
                color: done ? "#2E7D5B" : current ? "#8A6D1F" : "#94A3B8",
                fontWeight: current ? 600 : 400,
              }}
            >
              {done && <CheckCircle2 size={10} />}{s}
            </span>
            {i < stages.length - 1 && <ChevronRight size={11} className="text-slate-300" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Approval() {
  const [items, setItems] = useState([]);
  const [stages, setStages] = useState(["HOD", "Dean", "VC"]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [actingOn, setActingOn] = useState(null); // pageId currently being decided
  const [refreshKey, setRefreshKey] = useState(0);

  const loadItems = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/approvals?op=pending");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(data, "Failed to load agenda items"));
      setItems(data.items || []);
      if (data.stages) setStages(data.stages);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const act = async (pageId, action) => {
    setActingOn(pageId);
    setErrorMsg("");
    try {
      const res = await fetch("/api/approvals?op=decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(data, "Failed to record the decision"));
      await loadItems(); // an approved item moves to the next stage, so reload instead of dropping it
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setErrorMsg(err.message);
      loadItems();
    } finally {
      setActingOn(null);
    }
  };

  return (
    <>
      <SectionHeader eyebrow="Module 03" title="Approval Routing" desc="Agenda items move through the approval chain stage by stage. Every decision is time-stamped, so the audit trail shows where an item has been waiting." />
      <Card title="Pending approvals" className="mb-4">
        {loading && <p className="text-sm text-slate-400">Loading pending items…</p>}
        {!loading && errorMsg && (
          <div className="rounded-lg border p-3 text-xs mb-3" style={{ borderColor: "#F3C9C2", background: "#FBE9E7", color: "#B23A2E" }}>
            {errorMsg}
          </div>
        )}
        {!loading && !errorMsg && items.length === 0 && (
          <p className="text-sm text-slate-400">No agenda items are waiting for approval right now.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {items.map((it) => {
            const last = it.stageIndex >= stages.length - 1;
            const next = stages[it.stageIndex + 1];
            return (
              <li key={it.id} className="py-4">
                <div className="font-medium text-sm" style={{ color: NAVY }}>{it.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Submitted by {it.submittedBy || "—"} · {it.meeting || "—"}
                </div>
                {it.comment && <div className="text-xs text-slate-400 mt-1">"{it.comment}"</div>}
                <StageTracker stages={stages} index={it.stageIndex} />
                <div className="text-[11px] text-slate-400 mt-1.5">
                  Waiting {fmtHours(it.waitingHours)} at {it.stage}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => act(it.id, "approve")}
                    disabled={actingOn === it.id}
                    className="text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 disabled:opacity-60"
                    style={{ background: "#E4F2EA", color: "#2E7D5B" }}
                  >
                    <CheckCircle2 size={13} /> {last ? "Give final approval" : `Approve · send to ${next}`}
                  </button>
                  <button
                    onClick={() => act(it.id, "reject")}
                    disabled={actingOn === it.id}
                    className="text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 disabled:opacity-60"
                    style={{ background: "#FBE9E7", color: "#B23A2E" }}
                  >
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <PipelineAnalytics refreshKey={refreshKey} />
    </>
  );
}

function fmtClock(s) {
  const total = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function MeetingSelect({ disabled }) {
  const { meetingId, setMeetingId, meetings, meetingsState } = useCapture();
  const placeholder =
    meetingsState === "loading" ? "Loading meetings…" : meetingsState === "error" ? "Meetings unavailable" : "Select a meeting";

  return (
    <div>
      <label className="text-xs font-medium text-slate-400 block mb-1">Meeting</label>
      <select
        value={meetingId}
        disabled={disabled}
        onChange={(e) => setMeetingId(e.target.value)}
        className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white"
        style={{ color: NAVY }}
      >
        <option value="">{placeholder}</option>
        {meetings.map((m) => (
          <option key={m.id} value={m.id}>{m.name}{m.date ? ` · ${m.date}` : ""}</option>
        ))}
      </select>
    </div>
  );
}

function ErrorNotice() {
  const { error, dismissError, failed, retryFailed } = useCapture();
  if (!error) return null;
  return (
    <div className="mt-4 rounded-lg px-3 py-2 text-sm flex items-start justify-between gap-3" style={{ background: "#FBE9E7", color: "#B23A2E" }}>
      <span>{error}</span>
      <span className="flex gap-3 shrink-0 text-xs font-semibold">
        {failed > 0 && <button onClick={retryFailed}>Retry ({failed})</button>}
        <button onClick={dismissError}>Dismiss</button>
      </span>
    </div>
  );
}

function VideoTile({ p, big }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = p.videoTrack ? new MediaStream([p.videoTrack]) : null;
  }, [p.videoTrack]);
  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-slate-800 ${big ? "aspect-video" : "aspect-square"}`}
      style={p.speaking ? { boxShadow: `0 0 0 3px ${GOLD}` } : undefined}
    >
      {p.videoTrack ? (
        <video ref={ref} autoPlay playsInline muted={p.local} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white text-lg font-semibold" style={{ background: SLATE }}>
          {(p.name || "?").slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 bg-black/50 rounded-full px-2 py-0.5">
        <span className="text-white text-xs">{p.name}</span>
        {!p.audioOn && <MicOff size={11} className="text-red-300" />}
      </div>
    </div>
  );
}

function VideoMeetingPanel() {
  const {
    videoState, inviteUrl, micOn, camOn, participants,
    startVideoMeeting, leaveVideoMeeting, toggleMic, toggleCam, elapsed, pending,
  } = useCapture();
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the link is still shown below */
    }
  };

  if (videoState === "idle" || videoState === "error") {
    return (
      <Card className="mb-4">
        <div className="max-w-sm">
          <label className="text-xs font-medium text-slate-400 block mb-1">Your name (shown to other participants)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dr. Sana Malik"
            className="w-full border rounded-lg px-3 py-2 border-slate-200 outline-none text-sm mb-3"
          />
          <button
            onClick={() => startVideoMeeting(name.trim())}
            disabled={!name.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: NAVY }}
          >
            <Video size={15} /> Start video meeting
          </button>
        </div>
        <ErrorNotice />
      </Card>
    );
  }

  if (videoState === "creating") {
    return (
      <Card className="mb-4">
        <p className="text-sm text-slate-400">Setting up the video room…</p>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Chip tone="red">● In meeting {fmtClock(elapsed)}</Chip>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input readOnly value={inviteUrl} className="flex-1 min-w-0 text-xs border rounded-lg px-3 py-1.5 border-slate-200 text-slate-500 bg-slate-50" />
          <button onClick={copyLink} className="text-xs font-medium px-3 py-1.5 rounded-lg shrink-0" style={{ background: "#F3E4D6", color: SLATE }}>
            {copied ? "Copied" : "Copy invite link"}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">
        Share the link above with anyone joining online. They open it directly and get mic/camera controls automatically — no login needed.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {participants.map((p) => <VideoTile key={p.id} p={p} />)}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={toggleMic} className="w-11 h-11 rounded-full flex items-center justify-center text-white" style={{ background: micOn ? SLATE : "#C0392B" }} title={micOn ? "Mute" : "Unmute"}>
          {micOn ? <Mic size={17} /> : <MicOff size={17} />}
        </button>
        <button onClick={toggleCam} className="w-11 h-11 rounded-full flex items-center justify-center text-white" style={{ background: camOn ? SLATE : "#C0392B" }} title={camOn ? "Turn camera off" : "Turn camera on"}>
          {camOn ? <VideoIcon size={17} /> : <VideoOff size={17} />}
        </button>
        <button onClick={leaveVideoMeeting} className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "#C0392B" }}>
          <PhoneOff size={15} /> Leave & end session
        </button>
        {pending > 0 && <Chip tone="gold">Finishing transcript…</Chip>}
      </div>
      <ErrorNotice />
    </Card>
  );
}

function Capture() {
  const { mode, setMode, status, elapsed, level, pending, start, stop, lines, saveState } = useCapture();
  const recording = status === "recording";
  const [tab, setTab] = useState(mode);
  const attendance = [
    ["Dean, Mgmt Sciences", "Face-to-face", "11:02 AM", true],
    ["HOD, BBA", "Face-to-face", "11:00 AM", true],
    ["Azam Khan", "Face-to-face", "11:04 AM", true],
    ["Dr. Sana", "Online", "11:01 AM", true],
    ["Junaid Ali", "Online", "—", false],
  ];

  const begin = () => {
    if (lines.length && saveState !== "saved" &&
        !window.confirm("Starting a new session will replace the current unsaved transcript. Continue?")) return;
    start();
  };

  return (
    <>
      <SectionHeader eyebrow="Module 04" title="Live Meeting Capture & Attendance" desc="The Chair starts the session and the system captures the meeting audio, transcribing it as the discussion progresses. Attendance is logged on check-in." />

      <div className="flex gap-2 mb-4">
        {[["video", "Video meeting"], ["mic", "Mic only (this device)"]].map(([id, label]) => (
          <button
            key={id}
            disabled={recording && mode !== id}
            onClick={() => setTab(id)}
            className="text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-30"
            style={{ background: tab === id ? NAVY : "#F3E4D6", color: tab === id ? "#fff" : SLATE }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "video" ? (
        <VideoMeetingPanel />
      ) : (
      <Card className="mb-4">
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <MeetingSelect disabled={recording} />
          <div className="flex items-end">
            <p className="text-xs text-slate-400 leading-relaxed">
              Audio is processed in short segments and is never stored. The transcript appears live under
              "05 · AI Transcription".
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={recording ? stop : begin}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white shrink-0"
            style={{ background: recording ? "#C0392B" : NAVY }}
          >
            {recording ? <><Square size={14} fill="#fff" /> Stop session</> : <><Mic size={15} /> Start session</>}
          </button>

          <div className="flex-1 h-10 rounded-full bg-slate-100 flex items-center justify-center px-3 gap-0.5 overflow-hidden">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full"
                style={{
                  height: `${recording ? Math.max(4, Math.round(level * 30 * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7))))) : 4}px`,
                  background: SLATE,
                  opacity: 0.6,
                  transition: "height 80ms linear",
                }}
              />
            ))}
          </div>

          {recording
            ? <Chip tone="red">● Recording {fmtClock(elapsed)}</Chip>
            : pending > 0
              ? <Chip tone="gold">Finishing transcript…</Chip>
              : <Chip tone="slate">Ready</Chip>}
        </div>
        <ErrorNotice />
      </Card>
      )}

      <Card title="Attendance — auto-logged on check-in">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 text-xs">
              <th className="pb-2">Member</th><th className="pb-2">Mode</th><th className="pb-2">Checked in</th><th className="pb-2 text-center">Present</th>
            </tr>
          </thead>
          <tbody>
            {attendance.map(([name, mode, time, present]) => (
              <tr key={name} className="border-t border-slate-100">
                <td className="py-2 font-medium" style={{ color: NAVY }}>{name}</td>
                <td className="py-2"><Chip tone={mode === "Online" ? "green" : "slate"}>{mode}</Chip></td>
                <td className="py-2 text-slate-500">{time}</td>
                <td className="py-2 text-center">
                  {present ? <CheckCircle2 size={16} className="inline text-emerald-600" /> : <span className="text-xs text-slate-400">Not yet</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function speakerBadge(label) {
  const m = /^speaker\s*(\d+)$/i.exec(label || "");
  if (m) return `S${m[1]}`;
  return (label || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Transcription() {
  const {
    lines, status, pending, nameOf, renameSpeaker, meetingId, saveState, saveToMeeting, reset,
  } = useCapture();
  const [showEnglish, setShowEnglish] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [speakingId, setSpeakingId] = useState(null);

  const recording = status === "recording";
  const palette = [SLATE, NAVY, "#8A6D1F", "#2E7D5B"];
  const speakerOrder = [...new Set(lines.map((l) => l.speaker))];
  const lastSpeaker = lines.length ? lines[lines.length - 1].speaker : null;

  const speak = (line) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(line.english);
    utterance.lang = "en-US";
    utterance.onend = () => setSpeakingId(null);
    setSpeakingId(line.id);
    window.speechSynthesis.speak(utterance);
  };

  const commitRename = (label) => {
    renameSpeaker(label, draft);
    setEditing(null);
  };

  const saveLabel =
    saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to meeting record" : "Save to meeting record";

  const clearAll = () => {
    if (saveState === "saved" || window.confirm("Discard this transcript? It has not been saved to a meeting record.")) reset();
  };

  return (
    <>
      <SectionHeader eyebrow="Module 05" title="AI Transcription, Speaker ID & Read-back" desc="Speech-to-text converts the meeting audio, separates the speakers, and normalises mixed Urdu and English into one transcript. Any line can be read back aloud." />
      <Card>
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#2E7D5B" }}>
            {recording ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live{lastSpeaker ? ` speaker: ${nameOf(lastSpeaker)}` : " — listening"}
              </>
            ) : pending > 0 ? (
              <span style={{ color: "#8A6D1F" }}>Transcribing the final segment…</span>
            ) : (
              <span className="text-slate-400">{lines.length ? `${lines.length} lines` : "No active session"}</span>
            )}
          </div>
          <button
            onClick={() => setShowEnglish(!showEnglish)}
            className="text-xs px-3 py-1.5 rounded-full font-medium"
            style={{ background: "#F3E4D6", color: SLATE }}
          >
            {showEnglish ? "Show original (Roman Urdu)" : "Show translated (English)"}
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            No transcript yet. Start a session in "04 · Live Meeting Capture" and the conversation will appear here.
          </div>
        ) : (
          <div className="space-y-4 mb-4">
            {lines.map((line, i) => {
              const idx = speakerOrder.indexOf(line.speaker);
              const name = nameOf(line.speaker);
              return (
                <div key={line.id} className="flex gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                    style={{ background: palette[idx % palette.length] }}
                  >
                    {speakerBadge(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-400 flex items-center gap-2">
                      <span className="text-slate-300">#{i + 1}</span>
                      {editing === line.speaker ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commitRename(line.speaker)}
                          onKeyDown={(e) => e.key === "Enter" && commitRename(line.speaker)}
                          className="border border-slate-200 rounded px-1.5 py-0.5 text-xs"
                          style={{ color: NAVY }}
                        />
                      ) : (
                        <button
                          title="Click to rename this speaker"
                          onClick={() => { setEditing(line.speaker); setDraft(name === line.speaker ? "" : name); }}
                          className="underline decoration-dotted underline-offset-2"
                        >
                          {name}
                        </button>
                      )}
                      <span className="text-slate-300">{fmtClock(line.start)}</span>
                      <button
                        title="Read this line aloud"
                        onClick={() => speak(line)}
                        className="ml-auto p-1 rounded"
                        style={{ color: speakingId === line.id ? "#8A6D1F" : "#94a3b8" }}
                      >
                        <Volume2 size={14} />
                      </button>
                    </div>
                    <div className="text-sm text-slate-700">{showEnglish ? line.english : line.original}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <ErrorNotice />

        {lines.length > 0 && (
          <div className="border-t border-slate-100 pt-4 mt-4 grid md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <MeetingSelect disabled={recording} />
            <button
              onClick={saveToMeeting}
              disabled={!meetingId || recording || saveState === "saving" || saveState === "saved"}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40"
              style={{ background: NAVY }}
            >
              {saveLabel}
            </button>
            <button onClick={clearAll} disabled={recording} className="text-sm px-4 py-2 rounded-lg disabled:opacity-40" style={{ background: "#F3E4D6", color: SLATE }}>
              Clear
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

function minutesToText(m, meeting) {
  const out = [];
  out.push(`MINUTES OF MEETING${meeting?.name ? ` — ${meeting.name}` : ""}${meeting?.date ? ` (${meeting.date})` : ""}`);
  if (m.summary) out.push("", m.summary);
  const disc = m.discussion.filter((d) => d.topic || d.pointsText.trim());
  if (disc.length) {
    out.push("", "DISCUSSION");
    disc.forEach((d) => {
      out.push(`- ${d.topic}`);
      d.pointsText.split("\n").map((p) => p.trim()).filter(Boolean).forEach((p) => out.push(`    • ${p}`));
    });
  }
  const decisions = m.decisionsText.split("\n").map((d) => d.trim()).filter(Boolean);
  if (decisions.length) out.push("", "DECISIONS", ...decisions.map((d) => `- ${d}`));
  if (m.resolution.trim()) out.push("", "RESOLUTION", m.resolution.trim());
  const actions = m.actions.filter((a) => a.item.trim());
  if (actions.length) {
    out.push("", "ACTION ITEMS");
    actions.forEach((a) => out.push(`- ${a.item}${a.owner ? ` | Owner: ${a.owner}` : ""}${a.due ? ` | Due: ${a.due}` : ""}`));
  }
  return out.join("\n");
}

const inputCls = "mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none text-sm text-slate-700";

function Minutes() {
  const { lines, nameOf, meetings, meetingId, minutes, setMinutes } = useCapture();
  const [source, setSource] = useState("live");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [fu, setFu] = useState({ state: "idle", done: 0 }); // idle | adding | added
  const [copied, setCopied] = useState(false);

  const meeting = meetings.find((m) => m.id === meetingId);
  const useLive = lines.length > 0 && source === "live";

  const post = async (op, body) => {
    const res = await fetch(`/api/meeting-ai?op=${op}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "Request failed."), { detail: data.detail });
    return data;
  };

  const explain = (err) => (err.detail ? `${err.message} (${String(err.detail).slice(0, 180)})` : err.message);

  const generate = async () => {
    if (minutes && !window.confirm("Generating again will replace the current draft. Continue?")) return;
    setBusy(true);
    setError("");
    try {
      const body = useLive
        ? { lines: lines.map((l) => ({ speaker: nameOf(l.speaker), start: l.start, english: l.english })) }
        : { text: pasted };
      const { minutes: m } = await post("minutes", {
        ...body,
        meetingName: meeting?.name || "",
        meetingDate: meeting?.date || "",
      });
      setMinutes({
        summary: m.summary,
        discussion: m.discussion.map((d) => ({ topic: d.topic, pointsText: d.points.join("\n") })),
        decisionsText: m.decisions.join("\n"),
        resolution: m.resolution,
        actions: m.action_items,
      });
      setSaveState("idle");
      setFu({ state: "idle", done: 0 });
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const edit = (patch) => {
    setMinutes({ ...minutes, ...patch });
    setSaveState("idle");
  };
  const editTopic = (i, patch) => edit({ discussion: minutes.discussion.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const editAction = (i, patch) => edit({ actions: minutes.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const payload = () => ({
    summary: minutes.summary.trim(),
    discussion: minutes.discussion
      .map((d) => ({ topic: d.topic.trim(), points: d.pointsText.split("\n").map((p) => p.trim()).filter(Boolean) }))
      .filter((d) => d.topic || d.points.length),
    decisions: minutes.decisionsText.split("\n").map((d) => d.trim()).filter(Boolean),
    resolution: minutes.resolution.trim(),
    action_items: minutes.actions.filter((a) => a.item.trim()),
  });

  const save = async () => {
    setSaveState("saving");
    setError("");
    try {
      await post("save-minutes", { pageId: meetingId, minutes: payload() });
      setSaveState("saved");
    } catch (err) {
      setSaveState("idle");
      setError(explain(err));
    }
  };

  const sendActions = async () => {
    const items = minutes.actions.filter((a) => a.item.trim());
    setFu({ state: "adding", done: 0 });
    setError("");
    let done = 0;
    try {
      for (const a of items) {
        const res = await fetch("/api/followups?op=create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: a.item, owner: a.owner, due: a.due, meeting: meeting?.name || "" }),
        });
        if (!res.ok) throw new Error("Could not add an action item to the Follow-up Tracker.");
        done += 1;
        setFu({ state: "adding", done });
      }
      setFu({ state: "added", done });
    } catch (err) {
      setFu({ state: "idle", done });
      setError(`${err.message} ${done} of ${items.length} were added.`);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(minutesToText(minutes, meeting));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copying was blocked by the browser.");
    }
  };

  const canGenerate = !busy && (useLive || pasted.trim().length >= 40);
  const actionCount = minutes ? minutes.actions.filter((a) => a.item.trim()).length : 0;

  return (
    <>
      <SectionHeader eyebrow="Module 06" title="Minutes & Resolution Generator" desc="AI drafts the structured minutes and final resolution from the transcript. The draft is reviewed and edited before Dean/HOD sign-off." />

      <Card title="1 · Choose the source" className="mb-4">
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <MeetingSelect />
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Transcript source</label>
            <div className="flex gap-2">
              {[["live", `Live transcript (${lines.length} lines)`, lines.length === 0], ["paste", "Paste text", false]].map(([id, label, disabled]) => (
                <button
                  key={id}
                  disabled={disabled}
                  onClick={() => setSource(id)}
                  className="text-xs px-3 py-2 rounded-lg font-medium disabled:opacity-40"
                  style={{
                    background: (id === "live") === useLive ? NAVY : "#F3E4D6",
                    color: (id === "live") === useLive ? "#fff" : SLATE,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!useLive && (
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={7}
            placeholder="Paste the meeting transcript or your notes here (at least a few sentences)…"
            className="w-full border rounded-lg px-3 py-2 border-slate-200 outline-none text-sm text-slate-700"
          />
        )}

        <button
          onClick={generate}
          disabled={!canGenerate}
          className="mt-4 rounded-lg text-white text-sm py-2.5 px-5 font-medium flex items-center gap-2 disabled:opacity-40"
          style={{ background: NAVY }}
        >
          <FileSignature size={15} /> {busy ? "Drafting minutes…" : minutes ? "Regenerate draft" : "Generate draft minutes"}
        </button>

        {error && (
          <div className="mt-4 rounded-lg px-3 py-2 text-sm flex justify-between gap-3" style={{ background: "#FBE9E7", color: "#B23A2E" }}>
            <span>{error}</span>
            <button className="text-xs font-semibold shrink-0" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
      </Card>

      {minutes && (
        <>
          <div className="mb-4 rounded-lg px-4 py-2.5 text-xs flex items-center gap-2" style={{ background: "#F6EFDC", color: "#8A6D1F" }}>
            <ShieldCheck size={15} /> AI-generated draft. Check every line against the meeting and edit anything that is wrong before it is signed off.
          </div>

          <Card title="2 · Review and edit the minutes" className="mb-4">
            <div className="text-xs text-slate-400 mb-3">
              {meeting ? `${meeting.name}${meeting.date ? ` · ${meeting.date}` : ""}` : "No meeting selected"}
            </div>

            <label className="text-xs text-slate-400">Summary</label>
            <textarea className={inputCls} rows={3} value={minutes.summary} onChange={(e) => edit({ summary: e.target.value })} />

            <div className="mt-5 text-xs text-slate-400">Discussion</div>
            {minutes.discussion.length === 0 && <p className="text-sm text-slate-400 mt-1">No discussion points were drafted.</p>}
            <div className="space-y-3 mt-1">
              {minutes.discussion.map((d, i) => (
                <div key={i} className="rounded-lg border border-slate-100 p-3">
                  <input className={inputCls + " font-medium"} value={d.topic} onChange={(e) => editTopic(i, { topic: e.target.value })} placeholder="Topic" />
                  <textarea className={inputCls} rows={Math.max(2, d.pointsText.split("\n").length)} value={d.pointsText} onChange={(e) => editTopic(i, { pointsText: e.target.value })} placeholder="One point per line" />
                </div>
              ))}
            </div>

            <label className="text-xs text-slate-400 block mt-5">Decisions (one per line)</label>
            <textarea className={inputCls} rows={Math.max(2, minutes.decisionsText.split("\n").length)} value={minutes.decisionsText} onChange={(e) => edit({ decisionsText: e.target.value })} />

            <div className="rounded-xl border-2 border-dashed p-4 mt-5 flex gap-4" style={{ borderColor: GOLD }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: GOLD }}>
                <FileSignature size={20} />
              </div>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: "#8A6D1F" }}>
                  Resolution No. — to be assigned by the Secretary
                </div>
                <textarea
                  className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none font-serif text-base"
                  style={{ color: NAVY }}
                  rows={2}
                  value={minutes.resolution}
                  onChange={(e) => edit({ resolution: e.target.value })}
                  placeholder="No clear resolution was drafted. Write one if a decision was reached."
                />
              </div>
            </div>

            <div className="mt-5 text-xs text-slate-400">Action items</div>
            {minutes.actions.length === 0 && <p className="text-sm text-slate-400 mt-1">No action items were drafted.</p>}
            <div className="space-y-2 mt-1">
              {minutes.actions.map((a, i) => (
                <div key={i} className="grid grid-cols-[1fr_9rem_9rem_auto] gap-2 items-center">
                  <input className={inputCls.replace("mt-1 ", "")} value={a.item} onChange={(e) => editAction(i, { item: e.target.value })} placeholder="Action item" />
                  <input className={inputCls.replace("mt-1 ", "")} value={a.owner} onChange={(e) => editAction(i, { owner: e.target.value })} placeholder="Owner" />
                  <input className={inputCls.replace("mt-1 ", "")} value={a.due} onChange={(e) => editAction(i, { due: e.target.value })} placeholder="Due" />
                  <button className="text-xs text-slate-400 px-2" onClick={() => edit({ actions: minutes.actions.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              ))}
            </div>
            <button className="text-xs font-medium mt-2" style={{ color: SLATE }} onClick={() => edit({ actions: [...minutes.actions, { item: "", owner: "", due: "" }] })}>
              + Add action item
            </button>
          </Card>

          <Card title="3 · Finalise">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={save}
                disabled={!meetingId || saveState === "saving" || saveState === "saved"}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-40"
                style={{ background: NAVY }}
              >
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved to meeting record" : "Save to meeting record"}
              </button>
              <button
                onClick={sendActions}
                disabled={actionCount === 0 || fu.state !== "idle"}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
                style={{ background: "#E4F2EA", color: "#2E7D5B" }}
              >
                {fu.state === "adding"
                  ? `Adding ${fu.done}/${actionCount}…`
                  : fu.state === "added"
                    ? `${fu.done} added to Follow-up Tracker`
                    : `Add ${actionCount} action item${actionCount === 1 ? "" : "s"} to Follow-up Tracker`}
              </button>
              <button onClick={copy} className="text-sm px-4 py-2 rounded-lg" style={{ background: "#F3E4D6", color: SLATE }}>
                {copied ? "Copied" : "Copy as text"}
              </button>
            </div>
            {!meetingId && <p className="text-xs text-slate-400 mt-3">Select a meeting above to save the minutes to its record.</p>}
          </Card>
        </>
      )}
    </>
  );
}

function FollowUp() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({ item: "", owner: "", due: "", meeting: "" });
  const [saving, setSaving] = useState(false);
  const [actingOn, setActingOn] = useState(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/followups?op=get");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Failed to load follow-ups");
      setItems(data.items || []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async () => {
    if (!form.item.trim()) {
      setErrorMsg("Action item title is required.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/followups?op=create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Failed to add follow-up");
      setForm({ item: "", owner: "", due: "", meeting: "" });
      await load();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (id) => {
    setActingOn(id);
    try {
      const res = await fetch("/api/followups?op=status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: id, status: "Done" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Failed to update status");
      setItems(items.map((i) => (i.id === id ? { ...i, status: "Done" } : i)));
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setActingOn(null);
    }
  };

  const toneFor = (s) => (s === "Done" ? "green" : s === "In progress" ? "gold" : "slate");

  return (
    <>
      <SectionHeader eyebrow="Module 07" title="Follow-up & Action Tracker" desc="Open items from a resolution, tracked until they're closed out." />
      <Card title="Add an action item" className="mb-4">
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-slate-400">Action item</label>
            <input className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none" value={form.item} onChange={update("item")} placeholder="e.g. Circulate resolution to industry partners" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400">Owner</label>
              <input className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none" value={form.owner} onChange={update("owner")} placeholder="e.g. Dr. Sana Malik" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Due date</label>
              <input className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none" value={form.due} onChange={update("due")} placeholder="e.g. 10 Aug 2026" />
            </div>
            <div>
              <label className="text-xs text-slate-400">Meeting</label>
              <input className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none" value={form.meeting} onChange={update("meeting")} placeholder="e.g. BOS - BBA Program" />
            </div>
          </div>
          <button onClick={submit} disabled={saving} className="mt-1 w-full rounded-lg text-white text-sm py-2.5 font-medium flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: NAVY }}>
            <Send size={14} /> {saving ? "Saving…" : "Add action item"}
          </button>
          {errorMsg && (
            <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "#F3C9C2", background: "#FBE9E7", color: "#B23A2E" }}>{errorMsg}</div>
          )}
        </div>
      </Card>
      <Card>
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {!loading && items.length === 0 && <p className="text-sm text-slate-400">No action items yet.</p>}
        {!loading && items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 text-xs">
                <th className="pb-2">Action item</th><th className="pb-2">Owner</th><th className="pb-2">Due</th><th className="pb-2">Status</th><th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="py-3 pr-4" style={{ color: NAVY }}>{it.item}</td>
                  <td className="py-3 text-slate-500">{it.owner || "—"}</td>
                  <td className="py-3 text-slate-500">{it.due || "—"}</td>
                  <td className="py-3"><Chip tone={toneFor(it.status)}>{it.status}</Chip></td>
                  <td className="py-3">
                    {it.status !== "Done" && (
                      <button onClick={() => markDone(it.id)} disabled={actingOn === it.id} className="text-xs font-medium px-3 py-1 rounded-full disabled:opacity-60" style={{ background: "#E4F2EA", color: "#2E7D5B" }}>
                        Mark done
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function ArchiveView() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({ meeting: "", date: "", resolution: "" });
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const runSearch = async () => {
    setLoading(true);
    setErrorMsg("");
    setSearched(true);
    try {
      const res = await fetch(`/api/search-archive?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Search failed");
      setItems(data.items || []);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submitEntry = async () => {
    if (!form.meeting.trim()) {
      setErrorMsg("Meeting name is required.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/create-archive-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "Failed to add entry");
      setForm({ meeting: "", date: "", resolution: "" });
      setShowAdd(false);
      runSearch();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionHeader eyebrow="Module 08" title="Searchable Historical Archive" desc="Ask a plain question years later — the matching meeting, date, and resolution comes back instantly." />
      <Card>
        <div className="flex items-center gap-2 border rounded-full px-4 py-2.5 border-slate-200 mb-3">
          <Search size={16} className="text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="e.g. internship mandatory"
            className="flex-1 text-sm outline-none"
          />
          <button onClick={runSearch} className="text-xs font-medium px-3 py-1.5 rounded-full text-white" style={{ background: NAVY }}>
            Search
          </button>
        </div>

        {loading && <p className="text-sm text-slate-400">Searching…</p>}
        {errorMsg && (
          <div className="rounded-lg border p-3 text-xs mb-3" style={{ borderColor: "#F3C9C2", background: "#FBE9E7", color: "#B23A2E" }}>{errorMsg}</div>
        )}
        {!loading && searched && items.length === 0 && !errorMsg && (
          <p className="text-sm text-slate-400 mb-2">No matching resolutions found.</p>
        )}

        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                <Building2 size={13} /> {it.meeting} · {it.date}
              </div>
              <p className="text-sm text-slate-700">{it.resolution}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} className="text-xs font-medium" style={{ color: SLATE }}>+ Archive a resolution</button>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-slate-400">Meeting</label>
                <input className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none" value={form.meeting} onChange={update("meeting")} placeholder="e.g. BOS - BBA Program" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Date</label>
                  <input className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none" value={form.date} onChange={update("date")} placeholder="e.g. 28 Jul 2026" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400">Resolution</label>
                <input className="mt-1 w-full border rounded-lg px-3 py-2 border-slate-200 outline-none" value={form.resolution} onChange={update("resolution")} placeholder="e.g. RESOLVED: Internship made mandatory for all BBA students." />
              </div>
              <button onClick={submitEntry} disabled={saving} className="text-xs font-medium px-3 py-1.5 rounded-full text-white disabled:opacity-60" style={{ background: NAVY }}>
                {saving ? "Saving…" : "Save to archive"}
              </button>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

function Insights() {
  const [proposal, setProposal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const check = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/meeting-ai?op=decision-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || "Check failed."), { detail: data.detail });
      setResult(data);
    } catch (err) {
      setError(err.detail ? `${err.message} (${String(err.detail).slice(0, 180)})` : err.message);
    } finally {
      setBusy(false);
    }
  };

  const cards = result && [
    {
      title: result.conflictFound ? "Conflict with a prior resolution" : "No conflict detected",
      desc: result.conflictFound
        ? `${result.conflictSummary}${result.conflictMeeting ? ` (see "${result.conflictMeeting}")` : ""}`
        : result.note || "This proposal does not contradict any prior resolution on record.",
      tone: result.conflictFound ? "red" : "green",
      Icon: result.conflictFound ? Ban : ShieldCheck,
    },
    {
      title: result.recurringTheme ? "Recurring theme" : "No recurring theme found",
      desc: result.recurringTheme
        ? `"${result.recurringTheme}" — also present in: ${result.recurringEvidence.join(", ") || "related archive entries"}.`
        : "This topic doesn't match a pattern across prior archive entries yet.",
      tone: "gold",
      Icon: Sparkles,
    },
    {
      title: "Suggested next steps",
      desc: result.suggestedNextSteps.length ? null : "No specific next step was suggested.",
      list: result.suggestedNextSteps,
      tone: "slate",
      Icon: ClipboardCheck,
    },
  ];

  return (
    <>
      <SectionHeader eyebrow="Module 09" title="AI Decision Support" desc="Checks a proposed decision against the Historical Archive — prior resolutions, conflicts, and recurring themes — before senior management approves." />

      <Card className="mb-4">
        <label className="text-xs font-medium text-slate-400 block mb-1">Proposed decision or resolution</label>
        <textarea
          value={proposal}
          onChange={(e) => setProposal(e.target.value)}
          rows={4}
          placeholder="e.g. Make a 6-week industry internship mandatory for all BBA students starting Fall 2026."
          className="w-full border rounded-lg px-3 py-2 border-slate-200 outline-none text-sm text-slate-700"
        />
        <button
          onClick={check}
          disabled={busy || proposal.trim().length < 10}
          className="mt-3 rounded-lg text-white text-sm py-2.5 px-5 font-medium flex items-center gap-2 disabled:opacity-40"
          style={{ background: NAVY }}
        >
          <Sparkles size={15} /> {busy ? "Checking against the archive…" : "Check against archive"}
        </button>
        {error && (
          <div className="mt-4 rounded-lg px-3 py-2 text-sm flex justify-between gap-3" style={{ background: "#FBE9E7", color: "#B23A2E" }}>
            <span>{error}</span>
            <button className="text-xs font-semibold shrink-0" onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
      </Card>

      {result && (
        <>
          <p className="text-xs text-slate-400 mb-3">
            Checked against {result.archiveCount} archive {result.archiveCount === 1 ? "entry" : "entries"}
            {result.note && !result.conflictFound ? ` — ${result.note}` : ""}
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {cards.map(({ title, desc, list, tone, Icon }) => (
              <Card key={title}>
                <Icon size={18} style={{ color: tone === "green" ? "#2E7D5B" : tone === "red" ? "#B23A2E" : tone === "gold" ? GOLD : SLATE }} className="mb-2" />
                <div className="font-medium text-sm mb-1" style={{ color: NAVY }}>{title}</div>
                {desc && <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>}
                {list && list.length > 0 && (
                  <ul className="text-xs text-slate-500 leading-relaxed space-y-1 mt-1 list-disc list-inside">
                    {list.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Architecture() {
  const layers = [
    ["Client Layer", "Web dashboard (Next.js) + mobile-responsive views", "#F3E4D6"],
    ["API / Gateway", "REST API (Flask) · Auth · Role-based access control", "#F5E6D3"],
    ["Core Services", "Meetings · Agenda · Approval Routing · Follow-up Tracker", "#EFD9BE"],
    ["AI Engine", "Speech-to-Text · Translation · LLM Summarization (Gemini API)", "#F6EFDC"],
    ["Data Layer", "PostgreSQL (records) · Cloud Object Storage (audio/video)", "#F3E4D6"],
    ["Infrastructure", "Cloud hosting (AWS/Azure/GCP) · Multi-tenant per institution", "#F5EEE5"],
  ];
  return (
    <>
      <SectionHeader eyebrow="System design" title="Architecture" desc="Layered architecture — each layer only talks to the one directly above and below it." />
      <div className="max-w-xl mx-auto space-y-2">
        {layers.map(([name, desc, bg], i) => (
          <React.Fragment key={name}>
            <div className="rounded-lg p-4 border border-slate-200" style={{ background: bg }}>
              <div className="font-serif text-base" style={{ color: NAVY }}>{name}</div>
              <div className="text-xs text-slate-600 mt-1">{desc}</div>
            </div>
            {i < layers.length - 1 && <div className="text-center text-slate-300">↓</div>}
          </React.Fragment>
        ))}
      </div>
      <div className="max-w-xl mx-auto mt-6 grid grid-cols-3 gap-3 text-center text-xs">
        {["Video conferencing API", "Notification service (email/SMS)", "GitHub CI/CD"].map(x => (
          <div key={x} className="rounded-lg border border-dashed border-slate-300 p-3 text-slate-500">{x}</div>
        ))}
      </div>
    </>
  );
}

function Stack() {
  const groups = [
    ["Frontend", ["Next.js / React", "Tailwind CSS", "Responsive, mobile-first UI"]],
    ["Backend", ["Flask (Python) REST API", "JWT-based auth", "Role-based access middleware"]],
    ["Database & Storage", ["PostgreSQL", "Cloud object storage for audio/video files"]],
    ["AI Models / APIs", ["Speech-to-Text API (meeting transcription)", "Translation API (Roman Urdu/Urdu ↔ English)", "Gemini API — LLM for minutes summarization, resolution drafting & Q&A over the archive"]],
    ["Infra & DevOps", ["Cloud hosting — AWS / Azure / GCP", "Docker for containerized services", "GitHub Actions for CI/CD"]],
  ];
  return (
    <>
      <SectionHeader eyebrow="Reference" title="Tech Stack & AI Models" desc="What's actually powering each layer of the prototype." />
      <div className="grid md:grid-cols-2 gap-4">
        {groups.map(([title, items]) => (
          <Card key={title} title={title}>
            <ul className="space-y-1.5 text-sm text-slate-600">
              {items.map(i => <li key={i} className="flex gap-2"><Circle size={6} className="mt-2 shrink-0" style={{ color: SLATE }} fill={SLATE} />{i}</li>)}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

const SCREENS = {
  dashboard: Dashboard, orgstructure: OrgStructure, scheduling: Scheduling, agenda: AgendaBuilder,
  approval: Approval, capture: Capture, transcription: Transcription, minutes: Minutes,
  followup: FollowUp, archive: ArchiveView, insights: Insights,
};

function AppShell() {
  const [active, setActive] = useState("dashboard");
  const Screen = SCREENS[active];
  return (
    <div className="min-h-screen flex font-sans" style={{ background: BG }}>
      <aside className="w-64 shrink-0 hidden md:flex md:flex-col" style={{ background: NAVY }}>
        <div className="px-5 py-6 border-b border-white/10">
          <div className="text-white font-serif text-lg leading-tight">MeetIntel</div>
          <div className="text-[11px] text-white/50 mt-0.5">Office Minutes, Agenda &<br/>Documentation Mgmt System</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className="w-full flex items-center gap-2.5 px-5 py-2.5 text-sm text-left transition-colors"
              style={{
                color: active === id ? "#fff" : "rgba(255,255,255,0.6)",
                background: active === id ? "rgba(255,255,255,0.08)" : "transparent",
                borderLeft: active === id ? `3px solid ${GOLD}` : "3px solid transparent",
              }}
            >
              <Icon size={15} />{label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-[11px] text-white/40">Powered by MeetIntel · DSU</div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 overflow-x-auto flex gap-2">
          {NAV.map(({ id, label }) => (
            <button key={id} onClick={() => setActive(id)}
              className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap"
              style={{ background: active === id ? NAVY : "#F6EDE3", color: active === id ? "#fff" : "#555" }}>
              {label.replace(/^\d+\s·\s/, "")}
            </button>
          ))}
        </header>
        <div className="flex-1 overflow-y-auto p-5 md:p-10">
          <div className="max-w-5xl">
            <Screen />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <CaptureProvider>
      <AppShell />
    </CaptureProvider>
  );
}
