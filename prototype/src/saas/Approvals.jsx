import React, { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { useWorkspace } from "./context.jsx";
import { Card, Chip, useToast, StageTracker, fmtDuration, fmtDateTime, NAVY } from "./ui.jsx";
import { itemState, pipelineAnalytics, canDecide } from "./approvalMath.js";

export default function Approvals() {
  const { org, isAdmin, me, stages } = useWorkspace();
  const { notify, fail } = useToast();
  const [items, setItems] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [acting, setActing] = useState(null);

  const load = async () => {
    const [i, d, m] = await Promise.all([
      supabase.from("agenda_items").select("*").eq("org_id", org.id).order("created_at", { ascending: true }).limit(1000),
      supabase.from("approval_decisions").select("*").eq("org_id", org.id).limit(5000),
      supabase.from("meetings").select("id, title").eq("org_id", org.id),
    ]);
    if (i.error) return fail(i.error);
    setItems(i.data || []);
    setDecisions(d.data || []);
    setMeetings(m.data || []);
  };
  useEffect(() => { load(); }, [org.id]);

  const decide = async (itemId, action) => {
    setActing(itemId);
    const { data, error } = await supabase.rpc("decide_agenda_item", { p_item: itemId, p_action: action });
    setActing(null);
    if (error) { fail(error); return load(); }
    notify(
      data?.result === "approved" ? "Final approval given." :
      data?.result === "rejected" ? "Item rejected." :
      `Approved at ${data?.stage}. Sent to ${data?.next_stage}.`
    );
    load();
  };

  const stageNames = stages.map((s) => s.name);
  const meetingTitle = (id) => meetings.find((m) => m.id === id)?.title || "";
  const decisionsOf = (id) => decisions.filter((d) => d.item_id === id).sort((a, b) => a.stage_position - b.stage_position);
  const pending = (items || []).filter((i) => i.status === "pending");
  const analytics = items ? pipelineAnalytics(items, decisions, stages) : null;
  const maxAvg = analytics ? Math.max(0.0001, ...analytics.rows.map((r) => r.avgHours)) : 1;
  const finished = (items || []).filter((i) => i.status !== "pending").sort((a, b) => {
    const last = (id) => decisionsOf(id).at(-1)?.decided_at || "";
    return last(b.id).localeCompare(last(a.id));
  }).slice(0, 8);

  return (
    <>
      <h1 className="font-serif text-2xl mb-1" style={{ color: NAVY }}>Approvals</h1>
      <p className="text-sm text-slate-500 mb-4">Agenda items move through your approval chain stage by stage, and every decision is time-stamped.</p>

      <Card title={`Waiting for a decision (${pending.length})`} className="mb-4">
        {items === null ? <p className="text-sm text-slate-400">Loading…</p> : pending.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing is waiting for approval right now.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((it) => {
              const st = itemState(it, decisionsOf(it.id), stages.length);
              const allowed = canDecide({ isAdmin, approvalStage: me.approvalStage }, st.position);
              const stage = stages[st.position - 1];
              const next = stages[st.position];
              return (
                <li key={it.id} className="py-4">
                  <div className="font-medium text-sm" style={{ color: NAVY }}>{it.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{meetingTitle(it.meeting_id)} · submitted by {it.submitted_by_name || "a member"}</div>
                  <div className="mt-1.5"><StageTracker stages={stageNames} approved={st.approved} status="pending" /></div>
                  <div className="text-[11px] text-slate-400 mt-1.5">
                    Waiting {fmtDuration((Date.now() - Date.parse(st.since)) / 36e5)} at {stage?.name}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => decide(it.id, "approve")}
                      disabled={!allowed || acting === it.id}
                      title={allowed ? "" : `Only the ${stage?.name} approver can decide this`}
                      className="text-xs font-medium px-3 py-1.5 rounded-full disabled:opacity-40"
                      style={{ background: "#E4F2EA", color: "#2E7D5B" }}
                    >
                      {next ? `Approve · send to ${next.name}` : "Give final approval"}
                    </button>
                    <button
                      onClick={() => decide(it.id, "reject")}
                      disabled={!allowed || acting === it.id}
                      className="text-xs font-medium px-3 py-1.5 rounded-full disabled:opacity-40"
                      style={{ background: "#FBE9E7", color: "#B23A2E" }}
                    >
                      Reject
                    </button>
                    {!allowed && <span className="text-[11px] text-slate-400">Waiting for the {stage?.name} approver</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Approval pipeline: time spent at each stage" className="mb-4">
        {!analytics || analytics.rows.every((r) => r.decided + r.waiting === 0) ? (
          <p className="text-sm text-slate-400">No approval activity yet. Timing appears here once items start moving through the chain.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <Chip>{analytics.totals.items} {analytics.totals.items === 1 ? "item" : "items"}</Chip>
              <Chip tone="gold">{analytics.totals.pending} pending</Chip>
              <Chip tone="green">{analytics.totals.approved} approved</Chip>
              <Chip tone="red">{analytics.totals.rejected} rejected</Chip>
            </div>
            <div className="space-y-3">
              {analytics.rows.map((r) => {
                const has = r.decided + r.waiting > 0;
                const hot = analytics.bottleneck === r.position;
                return (
                  <div key={r.position}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium flex items-center gap-2" style={{ color: NAVY }}>{r.name}{hot && <Chip tone="red">Bottleneck</Chip>}</span>
                      <span className="text-slate-400">{has ? `avg ${fmtDuration(r.avgHours)} · ${r.decided} decided · ${r.waiting} waiting` : "no data yet"}</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${has ? Math.max(4, (r.avgHours / maxAvg) * 100) : 0}%`, background: hot ? "#C0392B" : "#6B4A42", opacity: hot ? 1 : 0.7 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Averages include decisions already made and the time pending items have waited so far.</p>
          </>
        )}
      </Card>

      {finished.length > 0 && (
        <Card title="Recently decided">
          <ul className="divide-y divide-slate-100">
            {finished.map((it) => {
              const last = decisionsOf(it.id).at(-1);
              return (
                <li key={it.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate" style={{ color: NAVY }}>{it.title}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <Chip tone={it.status === "approved" ? "green" : "red"}>{it.status === "approved" ? "Approved" : `Rejected at ${last?.stage_name || ""}`}</Chip>
                    <span className="text-[11px] text-slate-400">{fmtDateTime(last?.decided_at)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
