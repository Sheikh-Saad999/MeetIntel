import { useState } from "react";
import { callAI } from "./aiClient.js";

// A short conversation with the company's AI. `meetingId` limits the answers to one meeting.
export function useAsk({ orgId, meetingId = null, onUsage }) {
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', text, sources, followups, error }
  const [loading, setLoading] = useState(false);

  async function send(question) {
    const q = String(question || "").trim();
    if (!q || loading) return;
    const history = messages.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMessages((cur) => [...cur, { role: "user", text: q }]);
    setLoading(true);
    try {
      const out = await callAI("ask", { orgId, question: q, meetingId: meetingId || undefined, history });
      setMessages((cur) => [...cur, { role: "assistant", text: out.answer, sources: out.sources || [], followups: out.followups || [] }]);
      onUsage?.();
    } catch (e) {
      setMessages((cur) => [...cur, { role: "assistant", text: e.message, error: true }]);
    } finally {
      setLoading(false);
    }
  }
  return { messages, loading, send, clear: () => setMessages([]) };
}
