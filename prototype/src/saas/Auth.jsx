import React, { useState } from "react";
import { supabase } from "./supabase.js";
import { NAVY, GOLD, Field, Button, ErrorBox, inputCls } from "./ui.jsx";

const POINTS = [
  "Schedule meetings and build agendas",
  "Multi-level approvals with time-stamped audit trail",
  "AI transcription, minutes and decision support",
  "Set up for your own sector, departments and branding",
];

export default function Auth() {
  const [mode, setMode] = useState("signup"); // signup | login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        if (!data.session) setNotice("Account created. Check your email and click the confirmation link, then log in.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2" style={{ background: "#FBF7F2" }}>
      <div className="hidden md:flex flex-col justify-center px-14 text-white" style={{ background: NAVY }}>
        <div className="text-3xl font-serif mb-2">MeetIntel</div>
        <p className="text-white/70 mb-8 max-w-sm">Meeting management with AI, for any organization.</p>
        <ul className="space-y-3 max-w-sm">
          {POINTS.map((p) => (
            <li key={p} className="flex gap-2 text-sm text-white/90">
              <span style={{ color: GOLD }}>●</span> {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-sm">
          <h1 className="text-xl font-serif mb-1" style={{ color: NAVY }}>
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-xs text-slate-400 mb-5">
            {mode === "signup" ? "You will set up your company in the next step." : "Log in to your workspace."}
          </p>
          <ErrorBox onDismiss={() => setError("")}>{error}</ErrorBox>
          {notice && <div className="rounded-lg px-3 py-2 text-sm mb-3" style={{ background: "#E4F2EA", color: "#2E7D5B" }}>{notice}</div>}
          <Field label="Work email">
            <input className={inputCls} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </Field>
          <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
            <input className={inputCls} type="password" required autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button className="w-full mt-1" disabled={busy || !email || !password} type="submit">
            {busy ? "Please wait…" : mode === "signup" ? "Sign up" : "Log in"}
          </Button>
          <button type="button" className="text-xs mt-4 block mx-auto text-slate-500 underline" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); setNotice(""); }}>
            {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
          </button>
        </form>
      </div>
    </div>
  );
}
