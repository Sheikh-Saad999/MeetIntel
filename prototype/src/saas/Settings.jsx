import React, { useEffect, useRef, useState } from "react";
import { supabase, uploadLogo, checkLogo } from "./supabase.js";
import { useWorkspace } from "./context.jsx";
import { Card, Button, Field, inputCls, useToast, NAVY, limitText } from "./ui.jsx";

const MAX_STAGES = 5;

export default function Settings() {
  const { org, isAdmin, plan, plans, departments, stages, memberCount, reloadCore, reloadOrg } = useWorkspace();
  const { notify, fail } = useToast();
  const [busy, setBusy] = useState(false);

  // Draft rows carry a stable `key` (never derived from the text being typed), so the input keeps
  // focus while typing. Drafts are reset only when the saved data really changed, so saving one
  // section does not wipe unsaved edits in another.
  const counter = useRef(0);
  const newKey = () => `new-${++counter.current}`;

  // ----- departments (each row keeps its id, so renaming does not unlink meetings) -----
  const toDeptDraft = (list) => list.map((d) => ({ key: d.id, id: d.id, name: d.name }));
  const [dDraft, setDDraft] = useState(() => toDeptDraft(departments));
  const [newDept, setNewDept] = useState("");
  const deptSig = JSON.stringify(departments.map((d) => [d.id, d.name]));
  useEffect(() => setDDraft(toDeptDraft(departments)), [deptSig]);
  const maxDepts = plan?.max_departments ?? null;
  const atLimit = maxDepts != null && dDraft.length >= maxDepts;
  const dDirty = JSON.stringify(dDraft.map((d) => [d.id || null, d.name])) !== JSON.stringify(departments.map((d) => [d.id, d.name]));

  // ----- approval chain -----
  const toStageDraft = (list) => list.map((s) => ({ key: `s${s.position}`, name: s.name }));
  const [sDraft, setSDraft] = useState(() => toStageDraft(stages));
  const [newStage, setNewStage] = useState("");
  const stageSig = JSON.stringify(stages.map((s) => [s.position, s.name]));
  useEffect(() => setSDraft(toStageDraft(stages)), [stageSig]);
  const sDirty = JSON.stringify(sDraft.map((s) => s.name)) !== JSON.stringify(stages.map((s) => s.name));

  // ----- company profile -----
  const blank = { name: org.name, website: org.website || "", phone: org.phone || "", address: org.address || "", description: org.description || "", employee_range: org.employee_range || "" };
  const [profile, setProfile] = useState(blank);
  const pDirty = JSON.stringify(profile) !== JSON.stringify(blank) || profile.name !== org.name;

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) notify(ok); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const rpc = async (name, args) => { const { error } = await supabase.rpc(name, args); if (error) throw error; };

  const saveDepts = () => run(async () => {
    await rpc("sync_departments", { p_org: org.id, p_items: dDraft.map((d) => ({ id: d.id || null, name: d.name })) });
    await reloadCore();
  }, "Departments saved.");

  const saveStages = () => run(async () => {
    await rpc("save_approval_stages", { p_org: org.id, p_names: sDraft.map((s) => s.name) });
    await reloadCore();
  }, "Approval chain saved.");

  const saveProfile = () => run(async () => {
    const { error } = await supabase.from("organizations").update({
      name: profile.name.trim(), website: profile.website.trim() || null, phone: profile.phone.trim() || null,
      address: profile.address.trim() || null, description: profile.description.trim() || null, employee_range: profile.employee_range || null,
    }).eq("id", org.id);
    if (error) throw error;
    await reloadOrg();
  }, "Company profile saved.");

  const changeLogo = (file) => run(async () => {
    const problem = checkLogo(file);
    if (problem) throw new Error(problem);
    const url = await uploadLogo(org.id, file);
    const { error } = await supabase.from("organizations").update({ logo_url: url }).eq("id", org.id);
    if (error) throw error;
    await reloadOrg();
  }, "Logo updated.");

  const switchPlan = (id) => run(async () => {
    await rpc("change_plan", { p_org: org.id, p_plan_id: id });
    await reloadOrg();
  }, "Plan changed (simulated payment).");

  const addDept = () => {
    const n = newDept.trim();
    if (!n || atLimit || dDraft.some((d) => d.name.trim().toLowerCase() === n.toLowerCase())) return;
    setDDraft([...dDraft, { key: newKey(), name: n }]);
    setNewDept("");
  };
  const addStage = () => {
    const n = newStage.trim();
    if (!n || sDraft.length >= MAX_STAGES || sDraft.some((s) => s.name.trim().toLowerCase() === n.toLowerCase())) return;
    setSDraft([...sDraft, { key: newKey(), name: n }]);
    setNewStage("");
  };

  return (
    <>
      <h1 className="font-serif text-2xl mb-4" style={{ color: NAVY }}>Settings</h1>
      {!isAdmin && <p className="text-xs text-slate-400 mb-3">Only company admins can change these settings.</p>}
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Plan and usage">
          <div className="text-sm text-slate-600 space-y-1 mb-4">
            <div>Departments: <b>{departments.length}</b> / {limitText(maxDepts)}</div>
            <div>Members: <b>{memberCount ?? "…"}</b> / {limitText(plan?.max_members)}</div>
            <div>AI questions per month: <b>{plan ? (plan.ai_queries_per_month ?? "Custom") : "…"}</b></div>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <Button key={p.id} kind={p.id === org.plan_id ? "primary" : "soft"} disabled={busy || p.id === org.plan_id} onClick={() => switchPlan(p.id)}>{p.name}</Button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-2">Payment is simulated in this demo.</p>
        </Card>

        <Card title="Departments">
          <ul className="space-y-1.5 mb-3">
            {dDraft.map((d) => (
              <li key={d.key} className="flex items-center gap-2">
                <input className={inputCls} value={d.name} disabled={!isAdmin} onChange={(e) => setDDraft(dDraft.map((x) => (x.key === d.key ? { ...x, name: e.target.value } : x)))} />
                {isAdmin && <button className="text-xs text-slate-400 px-2" onClick={() => setDDraft(dDraft.filter((x) => x.key !== d.key))}>Remove</button>}
              </li>
            ))}
            {dDraft.length === 0 && <li className="text-sm text-slate-400">No departments yet.</li>}
          </ul>
          {isAdmin && (
            <>
              <div className="flex gap-2 mb-2">
                <input className={inputCls} value={newDept} disabled={atLimit} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDept())} placeholder={atLimit ? "Plan limit reached" : "Add a department"} />
                <Button kind="soft" onClick={addDept} disabled={!newDept.trim() || atLimit}>Add</Button>
              </div>
              {atLimit && <p className="text-[11px] text-slate-400 mb-2">You have reached the limit of the {plan?.name} plan. Change the plan to add more.</p>}
              <Button onClick={saveDepts} disabled={busy || !dDirty || dDraft.some((d) => !d.name.trim())}>Save departments</Button>
            </>
          )}
        </Card>

        <Card title="Approval chain">
          <p className="text-xs text-slate-500 mb-3">Agenda items are approved in this order. Rename the stages to match your organization.</p>
          <ol className="space-y-1.5 mb-3">
            {sDraft.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-4">{i + 1}.</span>
                <input className={inputCls} value={s.name} disabled={!isAdmin} onChange={(e) => setSDraft(sDraft.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)))} />
                {isAdmin && sDraft.length > 1 && <button className="text-xs text-slate-400 px-2" onClick={() => setSDraft(sDraft.filter((x) => x.key !== s.key))}>Remove</button>}
              </li>
            ))}
          </ol>
          {isAdmin && (
            <>
              <div className="flex gap-2 mb-2">
                <input className={inputCls} value={newStage} disabled={sDraft.length >= MAX_STAGES} onChange={(e) => setNewStage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStage())} placeholder={sDraft.length >= MAX_STAGES ? `At most ${MAX_STAGES} stages` : "Add a stage"} />
                <Button kind="soft" onClick={addStage} disabled={!newStage.trim() || sDraft.length >= MAX_STAGES}>Add</Button>
              </div>
              <Button onClick={saveStages} disabled={busy || !sDirty || sDraft.some((s) => !s.name.trim())}>Save approval chain</Button>
              <p className="text-[11px] text-slate-400 mt-2">The number of stages can only change while no agenda item is waiting for approval.</p>
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
              <Button onClick={saveProfile} disabled={busy || !pDirty || profile.name.trim().length < 2}>{pDirty ? "Save profile" : "Profile saved"}</Button>
              <label className="text-xs text-slate-500">
                Change logo: <input type="file" accept="image/png,image/jpeg,image/webp" className="text-xs" onChange={(e) => e.target.files?.[0] && changeLogo(e.target.files[0])} />
              </label>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
