import React, { useState } from "react";
import { callAI, participation, minutesText } from "../aiClient.js";
import { useAsk } from "../useAsk.js";
import { Card, Chip, Button, useToast, NAVY, GOLD, UsageMeter, inputCls } from "../ui.jsx";

const MOOD = { positive: ["😊", "green", "Positive"], neutral: ["😐", "slate", "Neutral"], mixed: ["🤔", "gold", "Mixed"], tense: ["😟", "red", "Tense"] };

function Section({ title, items, icon }) {
  if (!items?.length) return null;
  return (
    <Card title={title}>
      <ul className="space-y-1.5">
        {items.map((t, i) => <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-slate-300">{icon}</span><span>{t}</span></li>)}
      </ul>
    </Card>
  );
}

function AskThis({ orgId, meetingId, reloadUsage }) {
  const { messages, loading, send } = useAsk({ orgId, meetingId, onUsage: reloadUsage });
  const [q, setQ] = useState("");
  const last = messages.filter((m) => m.role === "assistant").at(-1);
  const submit = (text) => { send(text); setQ(""); };
  return (
    <Card title="Ask about this meeting">
      <div className="flex gap-2">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && submit(q)} placeholder="e.g. Who agreed to do what? / Is meeting mein kya faisla hua?" />
        <Button onClick={() => submit(q)} disabled={loading || !q.trim()}>{loading ? "…" : "Ask"}</Button>
      </div>
      {loading && <p className="text-xs text-slate-400 mt-3 animate-pulse">Reading this meeting's records…</p>}
      {last && !loading && (
        <div className="mt-3 text-sm rounded-xl px-4 py-3" style={last.error ? { background: "#FBE9E7", color: "#B23A2E" } : { background: "#FAF5EC", color: "#334155" }}>
          <div className="whitespace-pre-wrap leading-relaxed">{last.text}</div>
          {last.followups?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-3">{last.followups.map((f) => <button key={f} onClick={() => submit(f)} className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600">{f}</button>)}</div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function SummaryPanel({ orgId, meeting, lines, summary, onSummary, ensureSaved, usage, reloadUsage }) {
  const { notify, fail } = useToast();
  const [language, setLanguage] = useState(summary?.language || "en");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      await ensureSaved();
      const out = await callAI("summarize", { orgId, meetingId: meeting.id, language });
      onSummary(out.summary);
      notify("AI summary ready.");
    } catch (e) {
      fail(e.message);
    } finally {
      setBusy(false);
      reloadUsage?.();
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(minutesText(meeting, summary, lines)); notify("Minutes copied."); } catch { fail("Copying was blocked by the browser."); }
  };

  const people = participation(lines);
  const mood = summary ? MOOD[summary.sentiment?.label] || MOOD.neutral : null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={generate} disabled={busy}>{busy ? "Analysing the meeting…" : summary ? "↻ Regenerate" : "✨ Generate AI summary"}</Button>
          <select className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Summary language">
            <option value="en">Summary in English</option>
            <option value="roman-ur">Summary in Roman Urdu</option>
          </select>
          {summary && <Button kind="soft" onClick={copy}>Copy as minutes</Button>}
          <div className="ml-auto w-48"><UsageMeter usage={usage} /></div>
        </div>
        <p className="text-xs text-slate-500 mt-3">The AI reads the transcript, the agenda items (with their approval status) and the attached files, and writes the summary, decisions, action items and insights. It uses only what is on record.</p>
        {busy && (
          <div className="mt-4 space-y-2 animate-pulse" aria-label="working">
            <div className="h-3 rounded bg-slate-100 w-11/12" /><div className="h-3 rounded bg-slate-100 w-9/12" /><div className="h-3 rounded bg-slate-100 w-10/12" />
          </div>
        )}
      </Card>

      {summary && (
        <>
          <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${NAVY}, #5a1014)` }}>
            <div className="text-[11px] uppercase tracking-widest opacity-70 mb-1">AI summary</div>
            <p className="text-sm leading-relaxed">{summary.overview}</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,.15)" }}>{mood[0]} {mood[2]} tone</span>
              {summary.sentiment?.note && <span className="text-xs opacity-80">{summary.sentiment.note}</span>}
            </div>
            {summary.language_note && <div className="text-[11px] mt-2" style={{ color: GOLD }}>🗣 {summary.language_note}</div>}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Key points" items={summary.key_points} icon="•" />
            <Section title="Decisions" items={summary.decisions} icon="✓" />
          </div>

          {summary.action_items?.length > 0 && (
            <Card title={`Action items (${summary.action_items.length})`}>
              <ul className="divide-y divide-slate-100">
                {summary.action_items.map((a, i) => (
                  <li key={i} className="py-2 flex items-center gap-2 flex-wrap text-sm text-slate-700">
                    <span className="flex-1 min-w-[12rem]">{a.item}</span>
                    {a.owner && <Chip tone="brand">{a.owner}</Chip>}
                    {a.due && <Chip tone="gold">Due {a.due}</Chip>}
                    {!a.owner && !a.due && <Chip>No owner or date stated</Chip>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Concerns raised" items={summary.risks} icon="⚠" />
            <Section title="Open questions" items={summary.open_questions} icon="?" />
          </div>
        </>
      )}

      {people.length > 0 && (
        <Card title="Who spoke">
          <div className="space-y-2">
            {people.map((p) => (
              <div key={p.speaker}>
                <div className="flex justify-between text-xs mb-1"><span className="font-medium" style={{ color: NAVY }}>{p.speaker}</span><span className="text-slate-400">{p.share}% · {p.words} words · {p.turns} turn{p.turns > 1 ? "s" : ""}</span></div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, p.share)}%`, background: NAVY, opacity: 0.8 }} /></div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Counted from the transcript, not estimated by AI.</p>
        </Card>
      )}

      {!summary && !busy && lines.length === 0 && (
        <Card><p className="text-sm text-slate-500">Nothing to summarize yet. Record or paste a transcript in the <b>Transcript</b> tab, or attach files in the <b>Files</b> tab, then come back and press <b>Generate AI summary</b>.</p></Card>
      )}

      <AskThis orgId={orgId} meetingId={meeting.id} reloadUsage={reloadUsage} />
    </div>
  );
}
