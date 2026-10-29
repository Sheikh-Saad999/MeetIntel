import React, { useEffect, useState } from "react";
import App from "../App.jsx";
import { supabase, supabaseConfigured } from "./supabase.js";
import Auth from "./Auth.jsx";
import Onboarding from "./Onboarding.jsx";
import OrgHome from "./OrgHome.jsx";
import { Splash, Button } from "./ui.jsx";

// Entry point for signed-in users:
//   no session            -> signup / login
//   session, no company   -> onboarding wizard (sector, details, plan, departments)
//   session + company     -> the company workspace
// If the Supabase keys are not set (e.g. before they are added in Vercel) the original app is shown
// unchanged, so nothing breaks.
export default function SaaSRoot() {
  if (!supabaseConfigured) return <App />;
  return <Gate />;
}

function Gate() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [membership, setMembership] = useState(undefined); // undefined = loading, null = no company yet
  const [loadError, setLoadError] = useState("");
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadMembership = async (uid) => {
    setLoadError("");
    const { data, error } = await supabase
      .from("memberships")
      .select("role, organizations(*)")
      .eq("user_id", uid);
    if (error) return setLoadError("Could not load your workspace. Please try again.");
    setMembership(data && data.length ? data[0] : null);
  };

  const uid = session?.user?.id;
  useEffect(() => {
    if (!uid) { setMembership(undefined); setShowDemo(false); return; }
    setMembership(undefined);
    loadMembership(uid);
  }, [uid]);

  const signOut = () => supabase.auth.signOut();

  if (session === undefined) return <Splash>Loading…</Splash>;
  if (!session) return <Auth />;
  if (loadError) return <Splash><div className="text-center"><p className="mb-3">{loadError}</p><Button onClick={() => loadMembership(uid)}>Try again</Button></div></Splash>;
  if (membership === undefined) return <Splash>Loading your workspace…</Splash>;
  if (membership === null) return <Onboarding onDone={() => loadMembership(uid)} onSignOut={signOut} />;

  if (showDemo && membership.organizations.legacy_demo) {
    return (
      <>
        <App />
        <button
          onClick={() => setShowDemo(false)}
          className="fixed top-3 right-3 z-50 text-xs font-semibold px-3 py-1.5 rounded-full shadow"
          style={{ background: "#fff", color: "#81181C" }}
        >
          ← Workspace
        </button>
      </>
    );
  }

  return (
    <OrgHome
      membership={membership}
      onChange={() => loadMembership(uid)}
      onSignOut={signOut}
      onOpenDemo={() => setShowDemo(true)}
    />
  );
}
