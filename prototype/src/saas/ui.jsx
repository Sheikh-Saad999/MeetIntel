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
