import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase.js";
import { WorkspaceCtx } from "./context.jsx";
import { NAVY, GOLD, OrgAvatar, ToastProvider, Button } from "./ui.jsx";
import Overview from "./Overview.jsx";
import Meetings from "./Meetings.jsx";
import Agenda from "./Agenda.jsx";
import Approvals from "./Approvals.jsx";
import Members from "./Members.jsx";
import Settings from "./Settings.jsx";

const NAV = [
  ["overview", "Overview"],
  ["meetings", "Meetings"],
  ["agenda", "Agenda"],
  ["approvals", "Approvals"],
  ["members", "Members"],
  ["settings", "Settings"],
];
const PAGES = { overview: Overview, meetings: Meetings, agenda: Agenda, approvals: Approvals, members: Members, settings: Settings };

export default function Workspace({ membership, userId, onChange, onSignOut, onOpenDemo }) {
  const org = membership.organizations;
  const [page, setPage] = useState("overview");
  const [core, setCore] = useState({ departments: [], stages: [], plans: [], sectorName: "", memberCount: null });

  const loadCore = useCallback(async () => {
    const [d, st, p, s, m] = await Promise.all([
      supabase.from("departments").select("id, name").eq("org_id", org.id).order("created_at"),
      supabase.from("approval_stages").select("position, name").eq("org_id", org.id).order("position"),
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("sectors").select("name").eq("id", org.sector_id).maybeSingle(),
      supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", org.id),
    ]);
    setCore({
      departments: d.data || [],
      stages: st.data || [],
      plans: p.data || [],
      sectorName: s.data?.name || "",
      memberCount: m.count ?? null,
    });
  }, [org.id, org.sector_id]);
  useEffect(() => { loadCore(); }, [loadCore, org.plan_id]);

  const plan = core.plans.find((p) => p.id === org.plan_id);
  const value = {
    org,
    isAdmin: membership.role === "admin",
    me: { userId, email: membership.email, approvalStage: membership.approval_stage },
    ...core,
    plan,
    reloadCore: loadCore,
    reloadOrg: onChange,
  };
  const Page = PAGES[page];

  return (
    <ToastProvider>
      <WorkspaceCtx.Provider value={value}>
        <div className="min-h-screen md:flex" style={{ background: "#FBF7F2" }}>
          <aside className="md:w-60 md:min-h-screen bg-white border-b md:border-b-0 md:border-r border-slate-100 md:flex md:flex-col">
            <div className="flex items-center gap-3 px-4 py-4">
              <OrgAvatar org={org} />
              <div className="min-w-0">
                <div className="font-serif truncate" style={{ color: NAVY }}>{org.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{core.sectorName}</div>
              </div>
            </div>
            <nav className="flex md:flex-col gap-1 px-2 pb-2 md:pb-0 overflow-x-auto md:flex-1">
              {NAV.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setPage(id)}
                  className="text-left text-sm px-3 py-2 rounded-lg whitespace-nowrap"
                  style={page === id ? { background: NAVY, color: "#fff", fontWeight: 600 } : { color: "#475569" }}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="hidden md:block px-4 py-4 space-y-2 border-t border-slate-100">
              <div className="text-[11px] text-slate-400 truncate">{membership.email} · {membership.role === "admin" ? "Admin" : "Member"}</div>
              {org.legacy_demo && <Button kind="soft" className="w-full" onClick={onOpenDemo}>Open demo workspace</Button>}
              <Button kind="soft" className="w-full" onClick={onSignOut}>Sign out</Button>
            </div>
          </aside>

          <main className="flex-1 min-w-0 px-4 md:px-8 py-6 max-w-5xl">
            <Page goTo={setPage} />
            <div className="md:hidden mt-8 flex gap-2">
              {org.legacy_demo && <Button kind="soft" onClick={onOpenDemo}>Demo workspace</Button>}
              <Button kind="soft" onClick={onSignOut}>Sign out</Button>
            </div>
          </main>
        </div>
      </WorkspaceCtx.Provider>
    </ToastProvider>
  );
}
