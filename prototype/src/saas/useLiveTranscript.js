import { useEffect, useRef, useState } from "react";
import { createRecorder } from "../recorder.js";
import { callAI } from "./aiClient.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parseClock = (str) => String(str || "0:00").split(":").map((p) => parseInt(p, 10) || 0).reduce((t, p) => t * 60 + p, 0);

/**
 * Live microphone transcription for one meeting. The microphone is cut into ~75 second segments; each segment
 * is sent to the server one at a time (so speaker labels stay consistent) and the lines are appended to the
 * transcript. Nothing is stored except the text.
 */
export function useLiveTranscript({ orgId, lines, setLines, onUsage }) {
  const [status, setStatus] = useState("idle"); // idle | recording
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState(0);

  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  const recRef = useRef(null);
  const timer = useRef(null);
  const queue = useRef(Promise.resolve());
  const failedSegs = useRef([]);
  const base = useRef(0);
  const counter = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; clearInterval(timer.current); recRef.current?.stop(); }, []);

  async function process(seg) {
    const previousLines = linesRef.current.slice(-4).map(({ speaker, english }) => ({ speaker, english }));
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await callAI("transcribe", { orgId, audioBase64: seg.base64, mimeType: seg.mimeType, previousLines, seconds: Math.ceil(seg.durationSeconds) });
        const fresh = out.lines.map((l) => ({
          id: `${Date.now()}-${++counter.current}`, speaker: l.speaker, start: base.current + seg.offsetSeconds + parseClock(l.start), original: l.original, english: l.english,
        }));
        if (alive.current) setLines((cur) => [...cur, ...fresh].sort((a, b) => a.start - b.start));
        onUsage?.();
        return;
      } catch (e) {
        last = e;
        if (e.status === 429) { await sleep(15000); continue; }
        if (e instanceof TypeError) { await sleep(3000); continue; }   // network hiccup
        throw e;
      }
    }
    throw last;
  }

  function enqueue(seg) {
    setPending((p) => p + 1);
    queue.current = queue.current.then(async () => {
      try { await process(seg); }
      catch (e) {
        if (e.status === 402) { recRef.current?.stop(); clearInterval(timer.current); if (alive.current) setStatus("idle"); }
        else { failedSegs.current.push(seg); if (alive.current) setFailed(failedSegs.current.length); }
        if (alive.current) setError(e.message);
      } finally { if (alive.current) setPending((p) => p - 1); }
    });
  }

  async function start() {
    if (status !== "idle") return;
    setError("");
    base.current = linesRef.current.length ? Math.max(...linesRef.current.map((l) => l.start || 0)) + 5 : 0;   // continue after what is already there
    recRef.current = createRecorder({ onSegment: enqueue, onLevel: (v) => alive.current && setLevel(v), onError: (e) => alive.current && setError(e.message || "Recording error.") });
    try { await recRef.current.start(); } catch (e) { setError(e.message); return; }
    setElapsed(0);
    setStatus("recording");
    timer.current = setInterval(() => setElapsed((n) => n + 1), 1000);
  }

  function stop() {
    if (status !== "recording") return;
    clearInterval(timer.current);
    recRef.current?.stop();          // flushes the last segment into the queue
    setStatus("idle");
  }

  function retryFailed() {
    const segs = failedSegs.current; failedSegs.current = []; setFailed(0); setError("");
    segs.forEach(enqueue);
  }

  return { status, elapsed, level, pending, error, failed, start, stop, retryFailed, dismissError: () => setError("") };
}
