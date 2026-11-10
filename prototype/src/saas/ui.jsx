import React from "react";

export const NAVY = "#81181C";
export const GOLD = "#FAB717";

export const inputCls = "w-full border rounded-lg px-3 py-2 border-slate-200 outline-none text-sm text-slate-700 focus:border-slate-400";

export function Field({ label, hint, children }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-medium text-slate-500 block mb-1">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-400 block mt-1">{hint}</span>}
    </label>
  );
}

export function Button({ children, kind = "primary", className = "", ...rest }) {
  const style =
    kind === "primary" ? { background: NAVY, color: "#fff" } :
    kind === "danger" ? { background: "#FBE9E7", color: "#B23A2E" } :
    { background: "#F3E4D6", color: "#6B4A42" };
  return (
    <button
      className={`text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ErrorBox({ children, onDismiss }) {
  if (!children) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-sm flex justify-between gap-3 mb-3" style={{ background: "#FBE9E7", color: "#B23A2E" }}>
      <span>{children}</span>
      {onDismiss && <button className="text-xs font-semibold shrink-0" onClick={onDismiss}>Dismiss</button>}
    </div>
  );
}

export function Splash({ children }) {
  return <div className="min-h-screen flex items-center justify-center text-sm text-slate-400" style={{ background: "#FBF7F2" }}>{children}</div>;
}

export function OrgAvatar({ org, size = 40 }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [org.logo_url]);
  return org.logo_url && !failed ? (
    <img
      src={org.logo_url}
      alt={`${org.name} logo`}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="rounded-lg object-contain bg-white border border-slate-100"
    />
  ) : (
    <div style={{ width: size, height: size, background: NAVY }} className="rounded-lg flex items-center justify-center text-white font-semibold">
      {(org.name || "?").slice(0, 2).toUpperCase()}
    </div>
  );
}

export const limitText = (n) => (n == null ? "Unlimited" : String(n));

export function Card({ title, children, className = "", action }) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-base" style={{ color: NAVY }}>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const CHIP_TONES = {
  slate: ["#F1F5F9", "#64748B"], gold: ["#F6EFDC", "#8A6D1F"], green: ["#E4F2EA", "#2E7D5B"],
  red: ["#FBE9E7", "#B23A2E"], brand: ["#F9EDEE", NAVY],
};
export function Chip({ tone = "slate", children }) {
  const [bg, fg] = CHIP_TONES[tone] || CHIP_TONES.slate;
  return <span className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: bg, color: fg }}>{children}</span>;
}

// ---- Toast: success messages fade by themselves; errors stay until dismissed ----
const ToastCtx = React.createContext({ notify: () => {}, fail: () => {} });
export const useToast = () => React.useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [t, setT] = React.useState(null);
  React.useEffect(() => {
    if (!t || t.kind === "error") return;
    const id = setTimeout(() => setT(null), 4000);
    return () => clearTimeout(id);
  }, [t]);
  const value = React.useMemo(
    () => ({
      notify: (text) => setT({ kind: "ok", text }),
      fail: (e) => setT({ kind: "error", text: typeof e === "string" ? e : e?.message || "Something went wrong." }),
    }),
    []
  );
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {t && (
        <div
          role="status"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg flex items-start gap-3"
          style={t.kind === "error" ? { background: "#FBE9E7", color: "#B23A2E" } : { background: "#E4F2EA", color: "#2E7D5B" }}
        >
          <span className="flex-1">{t.text}</span>
          <button className="text-xs font-semibold" onClick={() => setT(null)}>✕</button>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// approved = how many stages have approved so far; status = pending | approved | rejected
export function StageTracker({ stages, approved, status }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {stages.map((name, i) => {
        const done = status === "approved" || i < approved;
        const rejected = status === "rejected" && i === approved;
        const current = status === "pending" && i === approved;
        const [bg, fg] = rejected ? CHIP_TONES.red : done ? CHIP_TONES.green : current ? CHIP_TONES.gold : CHIP_TONES.slate;
        return (
          <React.Fragment key={i}>
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: bg, color: fg, fontWeight: current ? 600 : 400, opacity: !done && !current && !rejected ? 0.7 : 1 }}>
              {done ? "✓ " : rejected ? "✕ " : ""}{name}
            </span>
            {i < stages.length - 1 && <span className="text-slate-300 text-xs">›</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";

export function fmtDuration(h) {
  if (!h || h < 1 / 60) return "<1m";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
