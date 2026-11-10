import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { useWorkspace } from "./context.jsx";
import { Card, Button, Chip, inputCls, useToast, fmtDateTime, NAVY, limitText } from "./ui.jsx";

export default function Members() {
  const { org, isAdmin, me, stages, plan, reloadCore } = useWorkspace();
  const { notify, fail } = useToast();
  const [members, setMembers] = useState(null);
  const [invites, setInvites] = useState([]);
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const m = await supabase.from("memberships").select("user_id, role, email, approval_stage, created_at").eq("org_id", org.id).order("created_at", { ascending: true });
    if (m.error) return fail(m.error);
    setMembers(m.data || []);
    if (isAdmin) {
      const i = await supabase.from("invites").select("code, approval_stage, expires_at").eq("org_id", org.id).is("used_by", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
      setInvites(i.data || []);
    }
  };
  useEffect(() => { load(); }, [org.id, isAdmin]);

  const linkFor = (code) => `${window.location.origin}/?invite=${code}`;
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); notify("Copied."); } catch { fail("Copying was blocked by the browser."); }
  };

  const createInvite = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("create_invite", { p_org: org.id, p_stage: stage ? Number(stage) : null });
    setBusy(false);
    if (error) return fail(error);
    notify("Invite created. Share the link with the new member.");
    copy(linkFor(data));
    load();
  };

  const assign = async (userId, value) => {
    const { error } = await supabase.rpc("set_member_stage", { p_org: org.id, p_user: userId, p_stage: value ? Number(value) : null });
    if (error) return fail(error);
    notify("Approver updated.");
    load();
  };

  return (
    <>
      <h1 className="font-serif text-2xl mb-1" style={{ color: NAVY }}>Members</h1>
      <p className="text-sm text-slate-500 mb-4">{members?.length ?? "…"} of {limitText(plan?.max_members)} members on the {plan?.name || ""} plan.</p>

      <Card title="Team" className="mb-4">
        {members === null ? <p className="text-sm text-slate-400">Loading…</p> : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.user_id} className="py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: NAVY }}>{m.email || "Member"}{m.user_id === me.userId ? " (you)" : ""}</div>
                  <div className="text-[11px] text-slate-400">Joined {fmtDateTime(m.created_at)}</div>
                </div>
                <Chip tone={m.role === "admin" ? "brand" : "slate"}>{m.role === "admin" ? "Admin" : "Member"}</Chip>
                {isAdmin ? (
                  <select className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white" value={m.approval_stage ?? ""} onChange={(e) => assign(m.user_id, e.target.value)} aria-label="Approver stage">
                    <option value="">Not an approver</option>
                    {stages.map((s) => <option key={s.position} value={s.position}>Approver: {s.name}</option>)}
                  </select>
                ) : m.approval_stage ? <Chip tone="gold">Approver: {stages[m.approval_stage - 1]?.name}</Chip> : null}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && <p className="text-[11px] text-slate-400 mt-3">Admins can decide at every stage. A member can only decide at the stage they are assigned to.</p>}
      </Card>

      {isAdmin && (
        <Card title="Invite a member">
          <p className="text-xs text-slate-500 mb-3">Create a one-time invite link (valid for 7 days). The person signs up with it and joins your company. No email is sent: share the link yourself.</p>
          <div className="flex gap-2 flex-wrap items-center mb-4">
            <select className={inputCls + " !w-auto"} value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">Regular member</option>
              {stages.map((s) => <option key={s.position} value={s.position}>Approver: {s.name}</option>)}
            </select>
            <Button onClick={createInvite} disabled={busy}>{busy ? "Creating…" : "Create invite link"}</Button>
          </div>
          {invites.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {invites.map((i) => (
                <li key={i.code} className="py-2 flex items-center gap-3 text-xs">
                  <code className="flex-1 truncate text-slate-600">{linkFor(i.code)}</code>
                  <span className="text-slate-400 shrink-0">{i.approval_stage ? `Approver: ${stages[i.approval_stage - 1]?.name}` : "Member"} · expires {fmtDateTime(i.expires_at)}</span>
                  <Button kind="soft" onClick={() => copy(linkFor(i.code))}>Copy</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
