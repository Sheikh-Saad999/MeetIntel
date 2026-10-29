import React, { useEffect, useState } from "react";
import { supabase, uploadLogo, checkLogo } from "./supabase.js";
import { NAVY, Field, Button, ErrorBox, inputCls, OrgAvatar, limitText } from "./ui.jsx";

const MODULES = [
  "Meeting Scheduling", "Agenda Builder", "Approval Routing", "Live Meeting Capture", "AI Transcription",
  "Minutes & Resolution", "Follow-up Tracker", "Historical Archive", "AI Decision Support",
];

function Card({ title, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm p-5 ${className}`}>
      <h2 className="font-serif text-base mb-3" style={{ color: NAVY }}>{title}</h2>
      {children}
    </section>
  );
}

export default function OrgHome({ membership, onChange, onSignOut, onOpenDemo }) {
  const org = membership.organizations;
  const isAdmin = membership.role === "admin";

  const [sector, setSector] = useState(null);
  const [plans, setPlans] = useState([]);
  const [depts, setDepts] = useState([]);
  const [memberCount, setMemberCount] = useState(null);
  const [draft, setDraft] = useState([]);
  const [newDept, setNewDept] = useState("");
  const [profile, setProfile] = useState({
    name: org.name, website: org.website || "", phone: org.phone || "", address: org.address || "",
    description: org.description || "", employee_range: org.employee_range || "",
  });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const plan = plans.find((p) => p.id === org.plan_id);
  const maxDepts = plan?.max_departments ?? null;

  const load = async () => {
    const [s, p, d, m] = await Promise.all([
      supabase.from("sectors").select("name").eq("id", org.sector_id).maybeSingle(),
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("departments").select("name").eq("org_id", org.id).order("created_at"),
      supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", org.id),
    ]);
    setSector(s.data);
    setPlans(p.data || []);
    const names = (d.data || []).map((x) => x.name);
    setDepts(names);
    setDraft(names);
    setMemberCount(m.count ?? null);
  };
  useEffect(() => { load(); }, [org.id, org.plan_id]);

  const run = async (fn, okMsg) => {
    setBusy(true); setError(""); setMsg("");
    try { await fn(); if (okMsg) setMsg(okMsg); } catch (e) { setError(e.message || "Something went wrong."); } finally { setBusy(false); }
  };

  const saveDepts = () => run(async () => {
    const { error: err } = await supabase.rpc("save_departments", { p_org: org.id, p_names: draft });
    if (err) throw err;
    await load();
  }, "Departments saved.");

  const saveProfile = () => run(async () => {
    const { error: err } = await supabase.from("organizations").update({
      name: profile.name.trim(), website: profile.website.trim() || null, phone: profile.phone.trim() || null,
      address: profile.address.trim() || null, description: profile.description.trim() || null,
      employee_range: profile.employee_range || null,
    }).eq("id", org.id);
    if (err) throw err;
    await onChange();
  }, "Company profile saved.");

  const changeLogo = (file) => run(async () => {
    const problem = checkLogo(file);
    if (problem) throw new Error(problem);
    const url = await uploadLogo(org.id, file);
    const { error: err } = await supabase.from("organizations").update({ logo_url: url }).eq("id", org.id);
    if (err) throw err;
    await onChange();
  }, "Logo updated.");

  const switchPlan = (id) => run(async () => {
    const { error: err } = await supabase.rpc("change_plan", { p_org: org.id, p_plan_id: id });
    if (err) throw err;
    await onChange();
  }, "Plan changed (simulated payment).");

  const dirty = JSON.stringify(draft) !== JSON.stringify(depts);
  const atLimit = maxDepts != null && draft.length >= maxDepts;
  const addDept = () => {
    const n = newDept.trim();
    if (!n || atLimit || draft.some((d) => d.toLowerCase() === n.toLowerCase())) return;
    setDraft([...draft, n]);
    setNewDept("");
  };

  return (
    <div className="min-h-screen" style={{ background: "#FBF7F2" }}>
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center gap-3">
          <OrgAvatar org={org} />
          <div className="flex-1 min-w-0">
            <div className="font-serif text-lg truncate" style={{ color: NAVY }}>{org.name}</div>
            <div className="text-xs text-slate-400">{sector?.name || ""} · {plan?.name || org.plan_id} plan · {isAdmin ? "Admin" : "Member"}</div>
          </div>
          {org.legacy_demo && <Button kind="soft" onClick={onOpenDemo}>Open demo workspace</Button>}
          <Button kind="soft" onClick={onSignOut}>Sign out</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6 grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <ErrorBox onDismiss={() => setError("")}>{error}</ErrorBox>
          {msg && <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#E4F2EA", color: "#2E7D5B" }}>{msg}</div>}
        </div>

        <Card title="Plan and usage">
          <div className="text-sm text-slate-600 space-y-1 mb-4">
            <div>Departments: <b>{depts.length}</b> / {limitText(maxDepts)}</div>
            <div>Members: <b>{memberCount ?? "…"}</b> / {limitText(plan?.max_members)}</div>
            <div>AI questions per month: <b>{plan ? (plan.ai_queries_per_month ?? "Custom") : "…"}</b></div>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <Button key={p.id} kind={p.id === org.plan_id ? "primary" : "soft"} disabled={busy || p.id === org.plan_id} onClick={() => switchPlan(p.id)}>
                  {p.name}
                </Button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-2">Payment is simulated in this demo.</p>
        </Card>

        <Card title="Departments">
          <ul className="space-y-1.5 mb-3">
            {draft.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <input className={inputCls} value={d} disabled={!isAdmin} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? e.target.value : x)))} />
                {isAdmin && <button className="text-xs text-slate-400 px-2" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>Remove</button>}
              </li>
            ))}
            {draft.length === 0 && <li className="text-sm text-slate-400">No departments yet.</li>}
          </ul>
          {isAdmin && (
            <>
              <div className="flex gap-2 mb-2">
                <input className={inputCls} value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDept())} placeholder={atLimit ? "Plan limit reached" : "Add a department"} disabled={atLimit} />
                <Button kind="soft" onClick={addDept} disabled={!newDept.trim() || atLimit}>Add</Button>
              </div>
              {atLimit && <p className="text-[11px] text-slate-400 mb-2">You have reached the limit of the {plan?.name} plan. Change the plan to add more.</p>}
              <Button onClick={saveDepts} disabled={busy || !dirty || draft.some((d) => !d.trim())}>Save departments</Button>
            </>
          )}
        </Card>

        <Card title="Company profile">
          <Field label="Name"><input className={inputCls} value={profile.name} disabled={!isAdmin} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-x-3">
            <Field label="Website"><input className={inputCls} value={profile.website} disabled={!isAdmin} onChange={(e) => setProfile({ ...profile, website: e.target.value })} /></Field>
            <Field label="Phone"><input className={inputCls} value={profile.phone} disabled={!isAdmin} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
          </div>
          <Field label="Address"><input className={inputCls} value={profile.address} disabled={!isAdmin} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></Field>
          <Field label="About"><textarea className={inputCls} rows={2} value={profile.description} disabled={!isAdmin} onChange={(e) => setProfile({ ...profile, description: e.target.value })} /></Field>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveProfile} disabled={busy || profile.name.trim().length < 2}>Save profile</Button>
              <label className="text-xs text-slate-500">
                Change logo: <input type="file" accept="image/png,image/jpeg,image/webp" className="text-xs" onChange={(e) => e.target.files?.[0] && changeLogo(e.target.files[0])} />
              </label>
            </div>
          )}
        </Card>

        <Card title="Modules">
          <ul className="grid grid-cols-1 gap-1.5 text-sm">
            {MODULES.map((m, i) => (
              <li key={m} className="flex justify-between text-slate-600">
                <span>{String(i + 1).padStart(2, "0")} · {m}</span>
                <span className="text-xs text-slate-400">Coming to your workspace</span>
              </li>
            ))}
          </ul>
        </Card>
      </main>
    </div>
  );
}
