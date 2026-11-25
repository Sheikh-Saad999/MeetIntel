import React, { useState } from "react";
import { Card, Chip, Button, ErrorBox, inputCls, NAVY } from "../ui.jsx";
import { fmtClock, participation } from "../aiClient.js";

const VIEWS = [["both", "Both"], ["english", "English"], ["original", "Roman Urdu"]];

export default function TranscriptPanel({ lines, setLines, live, dirty, saving, onSave, usage }) {
  const [view, setView] = useState("both");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState("");
  const recording = live.status === "recording";
  const minutesLeft = usage?.seconds_limit == null ? null : Math.max(0, Math.round((usage.seconds_limit - usage.seconds_used) / 60));

  const usePasted = () => {
    const text = pasted.trim();
    if (!text) return;
    const paragraphs = text.split(/\n{1,}/).map((s) => s.trim()).filter(Boolean);
    setLines((cur) => [...cur, ...paragraphs.map((p, i) => ({ id: `paste-${Date.now()}-${i}`, speaker: "Notes", start: cur.length + i, original: p, english: p }))]);
    setPasted(""); setPasteOpen(false);
  };
  // `renaming` holds the id of the ONE line being edited; the new name is applied to every line of that speaker
  const rename = (line) => {
    const to = draft.trim();
    if (to && to !== line.speaker) setLines((cur) => cur.map((l) => (l.speaker === line.speaker ? { ...l, speaker: to } : l)));
    setRenaming(null);
  };
  const speakers = [...new Set(lines.map((l) => l.speaker))];
  const palette = ["#81181C", "#6B4A42", "#8A6D1F", "#2E7D5B", "#3B5B8A"];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          {recording ? (
            <Button kind="danger" onClick={live.stop}>■ Stop</Button>
          ) : (
            <Button onClick={live.start}>🎙 Start live transcription</Button>
          )}
          <div className="flex-1 min-w-[8rem] h-9 rounded-full bg-slate-100 flex items-center justify-center gap-0.5 px-3 overflow-hidden" aria-label="microphone level">
            {Array.from({ length: 32 }).map((_, i) => (
              <div key={i} className="w-1 rounded-full" style={{ height: `${recording ? Math.max(4, Math.round(live.level * 26 * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7))))) : 4}px`, background: "#6B4A42", opacity: 0.6, transition: "height 80ms linear" }} />
            ))}
          </div>
          {recording ? <Chip tone="red">● {fmtClock(live.elapsed)}</Chip> : live.pending > 0 ? <Chip tone="gold">Finishing transcript…</Chip> : <Chip>Ready</Chip>}
        </div>
        <p className="text-xs text-slate-500 mt-3">Speak English, Urdu or Roman Urdu. Each line appears in Roman Urdu and English side by side, with the speakers told apart. Keep this page open while recording; text appears about a minute after each segment.</p>
        {minutesLeft != null && <p className="text-[11px] text-slate-400 mt-1">{minutesLeft} transcription minutes left this month on your plan.</p>}
        <ErrorBox onDismiss={live.dismissError}>{live.error}</ErrorBox>
        {live.failed > 0 && <button className="text-xs underline text-slate-600" onClick={live.retryFailed}>Retry {live.failed} segment{live.failed > 1 ? "s" : ""} that failed</button>}
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button className="text-xs underline text-slate-600" onClick={() => setPasteOpen(!pasteOpen)}>{pasteOpen ? "Hide" : "…or paste a transcript / meeting notes instead"}</button>
          {pasteOpen && (
            <div className="mt-2">
              <textarea className={inputCls} rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the transcript or your notes here. One paragraph per line works best." />
              <Button className="mt-2" onClick={usePasted} disabled={!pasted.trim()}>Add to transcript</Button>
            </div>
          )}
        </div>
      </Card>

      <Card
        title={`Transcript (${lines.length} line${lines.length === 1 ? "" : "s"})`}
        action={
          <div className="flex gap-1">
            {VIEWS.map(([id, label]) => (
              <button key={id} onClick={() => setView(id)} className="text-[11px] px-2.5 py-1 rounded-full" style={view === id ? { background: NAVY, color: "#fff" } : { background: "#F3E4D6", color: "#6B4A42" }}>{label}</button>
            ))}
          </div>
        }
      >
        {lines.length === 0 ? (
          <p className="text-sm text-slate-400">No transcript yet. Start live transcription above, or paste notes.</p>
        ) : (
          <ul className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {lines.map((l) => {
              const color = palette[speakers.indexOf(l.speaker) % palette.length];
              return (
                <li key={l.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full text-white text-[11px] font-semibold flex items-center justify-center shrink-0" style={{ background: color }}>
                    {(l.speaker || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      {renaming === l.id ? (
                        <input autoFocus className="border border-slate-200 rounded px-1.5 py-0.5 text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => rename(l)} onKeyDown={(e) => e.key === "Enter" && rename(l)} />
                      ) : (
                        <button className="underline decoration-dotted" title="Click to rename this speaker everywhere" onClick={() => { setRenaming(l.id); setDraft(l.speaker); }}>{l.speaker}</button>
                      )}
                      <span>{fmtClock(l.start)}</span>
                      <button className="ml-auto hover:text-red-700" title="Remove this line" onClick={() => setLines((cur) => cur.filter((x) => x.id !== l.id))}>✕</button>
                    </div>
                    {(view === "both" || view === "original") && l.original && <div className="text-sm text-slate-700">{l.original}</div>}
                    {(view === "both" || view === "english") && l.english && (view !== "both" || l.english !== l.original) && <div className={view === "both" ? "text-xs text-slate-500 italic" : "text-sm text-slate-700"}>{l.english}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
          <Button onClick={onSave} disabled={!dirty || saving || recording}>{saving ? "Saving…" : dirty ? "Save transcript" : "Transcript saved"}</Button>
          {lines.length > 0 && !recording && <Button kind="soft" onClick={() => window.confirm("Remove the whole transcript?") && setLines([])}>Clear</Button>}
          {dirty && <span className="text-[11px] text-amber-700">Unsaved changes</span>}
        </div>
      </Card>
    </div>
  );
}
