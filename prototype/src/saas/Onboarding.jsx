import React, { useEffect, useMemo, useState } from "react";
import { supabase, uploadLogo, checkLogo } from "./supabase.js";
import { NAVY, Field, Button, ErrorBox, inputCls, Splash, limitText } from "./ui.jsx";

const STEPS = ["Company", "Details & logo", "Plan", "Departments"];
const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

export default function Onboarding({ onDone, onSignOut }) {
  const [sectors, setSectors] = useState(null);
  const [plans, setPlans] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [sectorQuery, setSectorQuery] = useState("");
  const [info, setInfo] = useState({ website: "", phone: "", address: "", employee_range: "", description: "" });
  const [logo, setLogo] = useState(null);
  const [logoError, setLogoError] = useState("");
  const [planId, setPlanId] = useState("free");
  const [departments, setDepartments] = useState([]);
  const [newDept, setNewDept] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null); // org row once create_organization succeeded (lets "retry" resume)
  const [logoDone, setLogoDone] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([
        supabase.from("sectors").select("*").order("sort_order"),
        supabase.from("plans").select("*").order("sort_order"),
      ]);
      if (s.error || p.error) return setLoadError("Could not load the setup options. Please refresh the page.");
      setSectors(s.data);
      setPlans(p.data);
    })();
  }, []);

  const sector = sectors?.find((s) => s.id === sectorId);
  const plan = plans?.find((p) => p.id === planId);
  const maxDepts = plan?.max_departments ?? null;

  const filteredSectors = useMemo(
    () => (sectors || []).filter((s) => s.name.toLowerCase().includes(sectorQuery.trim().toLowerCase())),
    [sectors, sectorQuery]
  );
  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : ""), [logo]);

  const goToDepartments = () => {
    // first visit: start from the sector's suggested departments; later visits: just respect the plan limit
    const base = departments.length ? departments : sector?.default_departments || [];
    setDepartments(maxDepts == null ? base : base.slice(0, maxDepts));
    setStep(3);
  };

  const pickLogo = (file) => {
    const problem = checkLogo(file);
    setLogoError(problem);
    setLogo(problem ? null : file || null);
  };

  const addDept = () => {
    const n = newDept.trim();
    if (!n || departments.some((d) => d.toLowerCase() === n.toLowerCase())) return;
    if (maxDepts != null && departments.length >= maxDepts) return;
    setDepartments([...departments, n]);
    setNewDept("");
  };

  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      let org = created;
      if (!org) {
        const { data, error: err } = await supabase.rpc("create_organization", {
          p_name: name, p_sector_id: sectorId, p_plan_id: planId,
          p_website: info.website, p_phone: info.phone, p_address: info.address,
          p_description: info.description, p_employee_range: info.employee_range,
        });
        if (err) throw err;
        org = data;
        setCreated(org);
      }
      if (logo && !logoDone) {
        const url = await uploadLogo(org.id, logo);
        const { error: err } = await supabase.from("organizations").update({ logo_url: url }).eq("id", org.id);
        if (err) throw err;
        setLogoDone(true);
      }
      const { error: derr } = await supabase.rpc("save_departments", { p_org: org.id, p_names: departments });
      if (derr) throw derr;
      await onDone();
    } catch (err) {
      setError((err.message || "Something went wrong.") + (created ? " Your company is already created; press the button again to retry the remaining steps." : ""));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <Splash>{loadError}</Splash>;
  if (!sectors || !plans) return <Splash>Loading…</Splash>;

  const canNext = [name.trim().length >= 2 && sectorId, true, !!plan, departments.length > 0][step];

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: "#FBF7F2" }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="text-xl font-serif" style={{ color: NAVY }}>Set up your workspace</div>
          <button className="text-xs text-slate-500 underline" onClick={onSignOut}>Sign out</button>
        </div>

        <ol className="flex gap-2 mb-6 text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1 rounded-full px-3 py-1.5 text-center" style={{
              background: i === step ? NAVY : i < step ? "#E4F2EA" : "#F1F5F9",
              color: i === step ? "#fff" : i < step ? "#2E7D5B" : "#94A3B8",
            }}>{i + 1}. {s}</li>
          ))}
        </ol>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <ErrorBox onDismiss={() => setError("")}>{error}</ErrorBox>

          {step === 0 && (
            <>
              <Field label="Company / organization name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Pharma Ltd" />
              </Field>
              <div className="text-xs font-medium text-slate-500 mb-1">Your sector</div>
              <input className={inputCls + " mb-3"} value={sectorQuery} onChange={(e) => setSectorQuery(e.target.value)} placeholder="Search sectors…" />
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {filteredSectors.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSectorId(s.id)}
                    className="text-left text-sm rounded-lg border px-3 py-2.5"
                    style={sectorId === s.id ? { borderColor: NAVY, background: "#F9EDEE", color: NAVY, fontWeight: 600 } : { borderColor: "#E2E8F0", color: "#475569" }}
                  >
                    {s.name}
                  </button>
                ))}
                {filteredSectors.length === 0 && <div className="text-xs text-slate-400 col-span-2">No sector matches. Choose “Other”.</div>}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid md:grid-cols-2 gap-x-4">
                <Field label="Website"><input className={inputCls} value={info.website} onChange={(e) => setInfo({ ...info, website: e.target.value })} placeholder="https://" /></Field>
                <Field label="Phone"><input className={inputCls} value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></Field>
              </div>
              <Field label="Address"><input className={inputCls} value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} /></Field>
              <Field label="Company size">
                <select className={inputCls} value={info.employee_range} onChange={(e) => setInfo({ ...info, employee_range: e.target.value })}>
                  <option value="">Select…</option>
                  {SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}
                </select>
              </Field>
              <Field label="About the company"><textarea className={inputCls} rows={3} value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} /></Field>
              <Field label="Company logo" hint="PNG, JPG or WebP, up to 1 MB. Optional; you can add it later.">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pickLogo(e.target.files?.[0])} className="text-sm" />
              </Field>
              <ErrorBox>{logoError}</ErrorBox>
              {logoPreview && <img src={logoPreview} alt="Logo preview" className="h-16 rounded-lg border border-slate-100 object-contain bg-white" />}
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid md:grid-cols-3 gap-3">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlanId(p.id)}
                    className="text-left rounded-xl border p-4"
                    style={planId === p.id ? { borderColor: NAVY, background: "#F9EDEE" } : { borderColor: "#E2E8F0" }}
                  >
                    <div className="font-semibold" style={{ color: NAVY }}>{p.name}</div>
                    <div className="text-lg font-serif mb-2">{Number(p.price_usd_month) === 0 ? "Free" : `$${Number(p.price_usd_month)}/mo`}</div>
                    <ul className="text-xs text-slate-500 space-y-1">
                      <li>{limitText(p.max_departments)} departments</li>
                      <li>{limitText(p.max_members)} members</li>
                      <li>{p.ai_queries_per_month == null ? "Custom" : p.ai_queries_per_month} AI questions / month</li>
                    </ul>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">Payment is simulated in this demo: choosing a plan activates it immediately.</p>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>Departments for {name.trim() || "your company"}</span>
                <span>{departments.length} / {limitText(maxDepts)} on the {plan.name} plan</span>
              </div>
              <ul className="space-y-1.5 mb-3">
                {departments.map((d, i) => (
                  <li key={d + i} className="flex items-center gap-2">
                    <input className={inputCls} value={d} onChange={(e) => setDepartments(departments.map((x, j) => (j === i ? e.target.value : x)))} />
                    <button type="button" className="text-xs text-slate-400 px-2" onClick={() => setDepartments(departments.filter((_, j) => j !== i))}>Remove</button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input className={inputCls} value={newDept} onChange={(e) => setNewDept(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDept())} placeholder="Add a department" disabled={maxDepts != null && departments.length >= maxDepts} />
                <Button kind="soft" type="button" onClick={addDept} disabled={!newDept.trim() || (maxDepts != null && departments.length >= maxDepts)}>Add</Button>
              </div>
              {maxDepts != null && departments.length >= maxDepts && (
                <p className="text-[11px] text-slate-400 mt-2">You have reached the limit of the {plan.name} plan. Go back to choose a larger plan.</p>
              )}
            </>
          )}

          <div className="flex justify-between mt-6">
            <Button kind="soft" onClick={() => setStep(step - 1)} disabled={step === 0 || busy || !!created}>Back</Button>
            {step < 3 ? (
              <Button onClick={() => (step === 2 ? goToDepartments() : setStep(step + 1))} disabled={!canNext}>Next</Button>
            ) : (
              <Button onClick={finish} disabled={!canNext || busy}>{busy ? "Creating…" : created ? "Retry" : "Create my workspace"}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
