import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { useWorkspace } from "./context.jsx";
import { useAiUsage } from "./aiClient.js";
import { useAsk } from "./useAsk.js";
import { Card, Button, UsageMeter, NAVY, GOLD, fmtDateTime } from "./ui.jsx";

const IDEAS = [
  "Summarize the latest meeting",
  "Which agenda items are still waiting for approval?",
  "What decisions were taken recently, and who owns the follow-ups?",
  "Budget ke baare mein kya faisla hua tha?",
  "What do our uploaded documents say about costs or deadlines?",
];

function Dots() {
  return <span className="inline-flex gap-1 items-center">{[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>;
}

export default function AskAI({ goTo }) {
  const { org } = useWorkspace();
  const { usage, reload } = useAiUsage(org.id);
  const [meetings, setMeetings] = useState([]);
  const [scope, setScope] = useState("");
  const [q, setQ] = useState("");
  const { messages, loading, send, clear } = useAsk({ orgId: org.id, meetingId: scope || null, onUsage: reload });
  const end = useRef(null);

  useEffect(() => {
    supabase.from("meetings").select("id, title, scheduled_at").eq("org_id", org.id).order("scheduled_at", { ascending: false }).limit(100).then(({ data }) => setMeetings(data || []));
  }, [org.id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, loading]);

  const ask = (text) => { send(text); setQ(""); };
  const openSource = (s) => goTo("meeting", s.type === "meeting" ? s.id : s.meetingId);

  return (
    <>
      <div className="flex items-start gap-4 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-2xl" style={{ color: NAVY }}>Ask AI</h1>
          <p className="text-sm text-slate-500">Ask anything about your past meetings, minutes, decisions and uploaded files, in English or Roman Urdu. Answers come only from your company's own records and always show their sources.</p>
        </div>
        <div className="w-56"><UsageMeter usage={usage} /></div>
      </div>

      <Card className="mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Ask about</span>
          <select className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white max-w-xs" value={scope} onChange={(e) => { setScope(e.target.value); clear(); }}>
            <option value="">All meetings and files</option>
            {meetings.map((m) => <option key={m.id} value={m.id}>{m.title} · {fmtDateTime(m.scheduled_at)}</option>)}
          </select>
          {messages.length > 0 && <button className="text-xs text-slate-400 underline ml-auto" onClick={clear}>Clear conversation</button>}
        </div>
      </Card>

      <div className="space-y-3 mb-4 min-h-[8rem]">
        {messages.length === 0 && (
          <Card>
            <div className="text-sm text-slate-600 mb-3">Try one of these:</div>
            <div className="flex gap-2 flex-wrap">
              {IDEAS.map((i) => <button key={i} onClick={() => ask(i)} className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-slate-400 text-left">{i}</button>)}
            </div>
          </Card>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed" style={m.role === "user" ? { background: NAVY, color: "#fff" } : m.error ? { background: "#FBE9E7", color: "#B23A2E" } : { background: "#fff", color: "#334155", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.sources?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-3 pt-2 border-t border-slate-100">
                  {m.sources.map((s) => (
                    <button key={s.label} onClick={() => openSource(s)} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: s.type === "meeting" ? "#F9EDEE" : "#F6EFDC", color: s.type === "meeting" ? NAVY : "#8A6D1F" }} title="Open in the meeting room">
                      {s.type === "meeting" ? "📅" : "📎"} {s.title}
                    </button>
                  ))}
                </div>
              )}
              {m.followups?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">{m.followups.map((f) => <button key={f} onClick={() => ask(f)} className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-500 hover:border-slate-400">{f}</button>)}</div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="flex"><div className="rounded-2xl px-4 py-3 bg-white shadow-sm text-xs text-slate-400 flex items-center gap-2"><Dots /> Searching your records…</div></div>}
        <div ref={end} />
      </div>

      <div className="sticky bottom-3 flex gap-2 bg-white rounded-2xl shadow-lg p-2 border border-slate-100">
        <input className="flex-1 px-3 py-2 text-sm outline-none rounded-lg" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && ask(q)} placeholder="Ask a question about your meetings…" aria-label="Your question" />
        <Button onClick={() => ask(q)} disabled={loading || !q.trim()} style={{ background: GOLD, color: NAVY }}>Ask</Button>
      </div>
    </>
  );
}
