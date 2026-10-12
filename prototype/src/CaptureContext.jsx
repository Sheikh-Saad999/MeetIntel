import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { createRecorder, createTrackRecorder } from "./recorder.js";
import { Room, RoomEvent } from "livekit-client";

// Holds the live-session state above the individual screens, so a recording
// keeps running (and the transcript keeps growing) while the user switches
// between "Live Meeting Capture" and "AI Transcription".

const CaptureCtx = createContext(null);
export const useCapture = () => useContext(CaptureCtx);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseClock(str) {
  const parts = String(str || "0:00").split(":").map((p) => parseInt(p, 10) || 0);
  return parts.reduce((total, p) => total * 60 + p, 0);
}

export function CaptureProvider({ children }) {
  const [status, setStatus] = useState("idle"); // idle | recording
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [lines, setLines] = useState([]);
  const [pending, setPending] = useState(0); // segments currently being transcribed
  const [failed, setFailed] = useState(0); // segments waiting for a retry
  const [error, setError] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [speakerNames, setSpeakerNames] = useState({});
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [meetings, setMeetings] = useState([]);
  const [meetingsState, setMeetingsState] = useState("loading"); // loading | ready | error
  const [minutes, setMinutes] = useState(null); // the editable minutes draft (Module 06)
  const [mode, setMode] = useState("mic"); // 'mic' | 'video' — which capture mode is (or was last) active
  const [videoState, setVideoState] = useState("idle"); // idle | creating | in-call | error
  const [inviteUrl, setInviteUrl] = useState(""); // link for other participants to join, via our own app
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/meeting-ai?op=meetings")
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!alive) return;
        if (!ok) throw new Error();
        setMeetings(data.meetings || []);
        setMeetingsState("ready");
      })
      .catch(() => alive && setMeetingsState("error"));
    return () => { alive = false; };
  }, []);

  const linesRef = useRef([]);
  const queueRef = useRef(Promise.resolve());
  const failedRef = useRef([]);
  const recorderRef = useRef(null);
  const timerRef = useRef(null);
  const roomRef = useRef(null); // the active LiveKit Room, video mode only
  const videoCtxRef = useRef(null); // one shared AudioContext for every participant track
  const trackRecordersRef = useRef(new Map()); // participant identity -> { stop() }
  const audioElsRef = useRef(new Map()); // participant identity -> hidden <audio> playing their voice
  const leavingRef = useRef(false);

  // Segments are processed one at a time, in order, so speaker labels stay consistent.
  async function transcribeSegment(seg) {
    const previousLines = linesRef.current
      .slice(-4)
      .map(({ speaker, english }) => ({ speaker, english }));
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/meeting-ai?op=transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: seg.base64, mimeType: seg.mimeType, previousLines }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 429) {
          lastErr = new Error(data.error || "The transcription service is busy.");
          await sleep(15000);
          continue;
        }
        if (!res.ok) throw Object.assign(new Error(data.error || "Transcription failed."), { detail: data.detail });

        // In video-meeting mode, seg.speaker is the participant's real name
        // (the audio was already isolated to just them), so it always wins
        // over whatever speaker label Gemini guessed.
        const fresh = (data.lines || []).map((l, i) => ({
          id: `${seg.index}-${i}`,
          speaker: seg.speaker || l.speaker,
          start: seg.offsetSeconds + parseClock(l.start),
          original: l.original,
          english: l.english,
        }));
        linesRef.current = [...linesRef.current, ...fresh].sort((a, b) => a.start - b.start);
        setLines(linesRef.current);
        setSaveState((s) => (s === "saved" ? "idle" : s));
        return;
      } catch (err) {
        lastErr = err;
        if (err instanceof TypeError) {
          // network hiccup: wait briefly and retry
          await sleep(3000);
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  function enqueue(seg) {
    setPending((p) => p + 1);
    queueRef.current = queueRef.current.then(async () => {
      try {
        await transcribeSegment(seg);
      } catch (err) {
        failedRef.current.push(seg);
        setFailed(failedRef.current.length);
        const detail = err.detail ? ` (${String(err.detail).slice(0, 180)})` : "";
        setError((err.message || "A segment could not be transcribed.") + detail);
      } finally {
        setPending((p) => p - 1);
      }
    });
  }

  function reset() {
    linesRef.current = [];
    failedRef.current = [];
    setLines([]);
    setFailed(0);
    setError("");
    setSpeakerNames({});
    setSaveState("idle");
    setElapsed(0);
  }

  async function start() {
    if (status !== "idle") return;
    reset();
    setMode("mic");
    if (!recorderRef.current) {
      recorderRef.current = createRecorder({
        onSegment: enqueue,
        onLevel: setLevel,
        onError: (e) => setError(e.message || "Recording error."),
      });
    }
    try {
      await recorderRef.current.start();
    } catch (err) {
      setError(err.message);
      return;
    }
    setStatus("recording");
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  function stop() {
    if (status !== "recording") return;
    clearInterval(timerRef.current);
    recorderRef.current?.stop(); // flushes the final segment into the queue
    setStatus("idle");
  }

  // ---- Video meeting mode (Module 04, "Video meeting") ----
  // The Chair's browser joins a LiveKit room with our own lightweight UI.
  // Every participant's audio track arrives as a plain MediaStreamTrack
  // (LiveKit exposes this directly, no restricted "prebuilt" mode to work
  // around), so it's captured and transcribed separately, tagged with their
  // real name — no speaker guessing needed. Guests open an invite link that
  // lands on a small join screen inside this same app (LiveKit, unlike
  // Daily, doesn't host a ready-made call page of its own).
  const inviteLinkFor = (room) => `${window.location.origin}${window.location.pathname}?join=${room}`;

  function stopAudioEl(identity) {
    const el = audioElsRef.current.get(identity);
    if (el) {
      el.pause();
      el.srcObject = null;
      audioElsRef.current.delete(identity);
    }
  }

  function syncParticipants(room) {
    const local = room.localParticipant;
    const remotes = Array.from(room.remoteParticipants.values());
    const toTile = (p, isLocal) => ({
      id: isLocal ? "local" : p.identity,
      name: isLocal ? "You" : p.name || "Guest",
      local: isLocal,
      audioOn: isLocal ? local.isMicrophoneEnabled : Array.from(p.audioTrackPublications.values()).some((t) => !t.isMuted),
      videoOn: isLocal ? local.isCameraEnabled : Array.from(p.videoTrackPublications.values()).some((t) => !t.isMuted),
      speaking: !!p.isSpeaking,
      videoTrack: (() => {
        const pub = isLocal
          ? Array.from(local.videoTrackPublications.values())[0]
          : Array.from(p.videoTrackPublications.values())[0];
        return pub?.track?.mediaStreamTrack || null;
      })(),
    });
    setParticipants([toTile(local, true), ...remotes.map((p) => toTile(p, false))]);
  }

  async function startVideoMeeting(name) {
    if (videoState !== "idle") return;
    if (lines.length && saveState !== "saved" &&
        !window.confirm("Starting a new session will replace the current unsaved transcript. Continue?")) {
      return;
    }
    reset();
    setMode("video");
    setVideoState("creating");
    setError("");

    const roomName = `meet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      let ctx;
      try {
        ctx = new AudioContext();
      } catch {
        throw new Error("This browser cannot process audio for transcription.");
      }
      videoCtxRef.current = ctx;

      const res = await fetch("/api/meeting-ai?op=livekit-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: roomName, name: name || "Chair" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || "Could not create the video room."), { detail: data.detail });

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      const attach = (identity, track, participantLabel) => {
        if (trackRecordersRef.current.has(identity)) return;
        const rec = createTrackRecorder({
          track,
          sharedCtx: ctx,
          participantLabel,
          onSegment: enqueue,
          onLevel: identity === "local" ? setLevel : undefined,
          onError: (e) => setError(e.message || "Recording error."),
        });
        trackRecordersRef.current.set(identity, rec);
      };
      const detach = (identity) => {
        trackRecordersRef.current.get(identity)?.stop();
        trackRecordersRef.current.delete(identity);
      };

      room
        .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind === "audio") {
            // Chrome hands Web Audio pure silence for a remote WebRTC track unless
            // the track is also playing in a media element. Playing it here also
            // lets the Chair hear the participant. Must happen before recording starts.
            const el = new Audio();
            el.autoplay = true;
            el.srcObject = new MediaStream([track.mediaStreamTrack]);
            el.play().catch(() => {});
            audioElsRef.current.set(participant.identity, el);
            attach(participant.identity, track.mediaStreamTrack, participant.name || "Guest");
          }
          syncParticipants(room);
        })
        .on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
          if (track.kind === "audio") {
            detach(participant.identity);
            stopAudioEl(participant.identity);
          }
          syncParticipants(room);
        })
        .on(RoomEvent.ActiveSpeakersChanged, () => syncParticipants(room))
        .on(RoomEvent.LocalTrackPublished, (pub) => {
          if (pub.kind === "audio" && pub.track) attach("local", pub.track.mediaStreamTrack, name || "Chair");
          syncParticipants(room);
        })
        .on(RoomEvent.ParticipantConnected, () => syncParticipants(room))
        .on(RoomEvent.ParticipantDisconnected, (p) => {
          detach(p.identity);
          stopAudioEl(p.identity);
          syncParticipants(room);
        })
        .on(RoomEvent.Disconnected, () => leaveVideoMeeting());

      await room.connect(data.url, data.token);
      await room.localParticipant.enableCameraAndMicrophone();

      setInviteUrl(inviteLinkFor(roomName));
      setVideoState("in-call");
      setStatus("recording");
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      syncParticipants(room);
      setMicOn(true);
      setCamOn(true);
    } catch (err) {
      setVideoState("error");
      const detail = err.detail ? ` (${String(err.detail).slice(0, 180)})` : "";
      setError((err.message || "Could not start the video meeting.") + detail);
      try {
        await videoCtxRef.current?.close();
      } catch {
        /* already closed */
      }
      videoCtxRef.current = null;
    }
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  async function toggleCam() {
    const room = roomRef.current;
    if (!room) return;
    const next = !camOn;
    await room.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }

  async function leaveVideoMeeting() {
    // disconnect() fires a Disconnected event that calls this again; run once.
    if (leavingRef.current) return;
    leavingRef.current = true;
    clearInterval(timerRef.current);
    trackRecordersRef.current.forEach((r) => r.stop());
    trackRecordersRef.current.clear();
    Array.from(audioElsRef.current.keys()).forEach(stopAudioEl);
    try {
      await roomRef.current?.disconnect();
    } catch {
      /* already gone */
    }
    roomRef.current = null;
    try {
      await videoCtxRef.current?.close();
    } catch {
      /* already closed */
    }
    videoCtxRef.current = null;
    setParticipants([]);
    setInviteUrl("");
    setVideoState("idle");
    setStatus("idle");
    setLevel(0);
    leavingRef.current = false;
  }

  function retryFailed() {
    const segs = failedRef.current;
    failedRef.current = [];
    setFailed(0);
    setError("");
    segs.forEach(enqueue);
  }

  function renameSpeaker(label, name) {
    setSpeakerNames((m) => ({ ...m, [label]: name.trim() }));
  }

  const nameOf = (label) => speakerNames[label] || label;

  async function saveToMeeting() {
    if (!meetingId || !linesRef.current.length) return;
    setSaveState("saving");
    setError("");
    try {
      const res = await fetch("/api/meeting-ai?op=save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: meetingId,
          lines: linesRef.current.map((l) => ({ ...l, speaker: nameOf(l.speaker) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save the transcript.");
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(err.message);
    }
  }

  // Nothing is stored locally, so warn before the tab closes with unsaved work.
  useEffect(() => {
    const unsaved = status === "recording" || pending > 0 || (lines.length > 0 && saveState !== "saved");
    if (!unsaved) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status, pending, lines.length, saveState]);

  const value = {
    status, elapsed, level, lines, pending, failed, error,
    meetingId, setMeetingId, speakerNames, nameOf, saveState,
    meetings, meetingsState, minutes, setMinutes,
    mode, videoState, inviteUrl, micOn, camOn, participants,
    startVideoMeeting, leaveVideoMeeting, toggleMic, toggleCam,
    start, stop, reset, retryFailed, renameSpeaker, saveToMeeting,
    dismissError: () => setError(""),
  };

  return <CaptureCtx.Provider value={value}>{children}</CaptureCtx.Provider>;
}
