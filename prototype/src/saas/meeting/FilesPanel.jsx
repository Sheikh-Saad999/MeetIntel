import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase.js";
import { callAI } from "../aiClient.js";
import { Card, Chip, Button, useToast, NAVY } from "../ui.jsx";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", txt: "text/plain",
  md: "text/markdown", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
};
const ICON = { pdf: "📕", docx: "📘", xlsx: "📗", csv: "📊", txt: "📄", md: "📄", png: "🖼️", jpg: "🖼️", jpeg: "🖼️" };
const ext = (name) => String(name).toLowerCase().split(".").pop();
const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function DocRow({ doc, busy, canDelete, onOpen, onDelete, onRetry }) {
  const [open, setOpen] = useState(false);
  const tone = busy ? "gold" : doc.status === "indexed" ? "green" : doc.status === "failed" ? "red" : "slate";
  const label = busy ? busy : doc.status === "indexed" ? "Read by AI" : doc.status === "failed" ? "Could not be read" : "Not read yet";
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-lg" aria-hidden>{ICON[ext(doc.name)] || "📎"}</span>
        <button className="text-sm font-medium text-left truncate max-w-[16rem] hover:underline" style={{ color: NAVY }} onClick={onOpen} title="Download">{doc.name}</button>
        <span className="text-[11px] text-slate-400">{fmtSize(doc.size_bytes || 0)}</span>
        <Chip tone={tone}>{busy && <span className="inline-block animate-pulse">● </span>}{label}</Chip>
        <span className="flex-1" />
        {doc.summary && <button className="text-xs text-slate-500 underline" onClick={() => setOpen(!open)}>{open ? "Hide summary" : "AI summary"}</button>}
        {doc.status !== "indexed" && !busy && <button className="text-xs text-slate-500 underline" onClick={onRetry}>Read with AI</button>}
        {canDelete && <button className="text-xs text-slate-400 hover:text-red-700" onClick={onDelete}>Delete</button>}
      </div>
      {open && doc.summary && <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 mt-2 leading-relaxed">{doc.summary}</p>}
      {doc.status === "failed" && doc.error && <p className="text-[11px] text-red-700 mt-1">{doc.error}</p>}
    </li>
  );
}

function UploadButton({ onFiles, label = "Add files", disabled }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" multiple className="hidden" accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg" onChange={(e) => { onFiles([...e.target.files]); e.target.value = ""; }} />
      <Button kind="soft" onClick={() => ref.current?.click()} disabled={disabled}>＋ {label}</Button>
    </>
  );
}

export default function FilesPanel({ orgId, meeting, isAdmin, me, onChanged }) {
  const { notify, fail } = useToast();
  const [items, setItems] = useState([]);
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState({});          // documentId or temp key -> text
  const [drag, setDrag] = useState(false);
  const [pending, setPending] = useState([]);    // uploads in flight (no row yet)

  const load = async () => {
    const [i, d] = await Promise.all([
      supabase.from("agenda_items").select("id, title, status, description").eq("meeting_id", meeting.id).order("created_at", { ascending: true }),
      supabase.from("documents").select("id, meeting_id, agenda_item_id, name, mime_type, size_bytes, storage_path, summary, status, error, uploaded_by, created_at").eq("meeting_id", meeting.id).order("created_at", { ascending: true }),
    ]);
    setItems(i.data || []);
    setDocs(d.data || []);
  };
  useEffect(() => { load(); }, [meeting.id]);

  const setB = (k, v) => setBusy((b) => { const n = { ...b }; if (v) n[k] = v; else delete n[k]; return n; });

  const index = async (id) => {
    setB(id, "Reading with AI…");
    try { await callAI("index-document", { orgId, documentId: id }); notify("The AI has read the file."); }
    catch (e) { fail(e.message); }
    setB(id, null);
    await load();
    onChanged?.();
  };

  const upload = async (file, agendaItemId) => {
    const e = ext(file.name);
    if (!TYPES[e]) return fail(`“${file.name}”: this file type is not supported. Use PDF, Word (.docx), Excel (.xlsx), CSV, text or an image. (Old .doc and .xls files: save them as .docx / .xlsx first.)`);
    if (file.size > MAX_BYTES) return fail(`“${file.name}” is larger than 10 MB.`);
    const key = `${file.name}-${Date.now()}`;
    setPending((p) => [...p, { key, name: file.name }]);
    try {
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
      const path = `${orgId}/${crypto.randomUUID()}-${safe}`;
      const up = await supabase.storage.from("documents").upload(path, file, { contentType: TYPES[e], upsert: false });
      if (up.error) throw new Error(up.error.message);
      const ins = await supabase.from("documents").insert({ org_id: orgId, meeting_id: meeting.id, agenda_item_id: agendaItemId || null, name: file.name, mime_type: TYPES[e], size_bytes: file.size, storage_path: path }).select("id").single();
      if (ins.error) { await supabase.storage.from("documents").remove([path]); throw new Error(ins.error.message); }
      setPending((p) => p.filter((x) => x.key !== key));
      await load();
      await index(ins.data.id);
    } catch (err) {
      setPending((p) => p.filter((x) => x.key !== key));
      fail(`“${file.name}” could not be uploaded: ${err.message}`);
    }
  };
  const uploadMany = (files, agendaItemId) => files.forEach((f) => upload(f, agendaItemId));

  const open = async (doc) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60);
    if (error) return fail(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const remove = async (doc) => {
    if (!window.confirm(`Delete “${doc.name}”?`)) return;
    await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", doc.id);
    if (error) return fail(error.message);
    notify("File deleted.");
    load();
    onChanged?.();
  };

  const list = (arr, empty) => (
    <ul className="divide-y divide-slate-100">
      {arr.map((d) => <DocRow key={d.id} doc={d} busy={busy[d.id]} canDelete={isAdmin || d.uploaded_by === me.userId} onOpen={() => open(d)} onDelete={() => remove(d)} onRetry={() => index(d.id)} />)}
      {arr.length === 0 && <li className="py-2 text-xs text-slate-400">{empty}</li>}
    </ul>
  );
  const general = docs.filter((d) => !d.agenda_item_id);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); uploadMany([...e.dataTransfer.files], null); }}
        className="rounded-2xl border-2 border-dashed px-5 py-6 text-center transition-colors"
        style={{ borderColor: drag ? NAVY : "#E2D5C8", background: drag ? "#F9EDEE" : "#fff" }}
      >
        <div className="text-2xl mb-1" aria-hidden>📎</div>
        <div className="text-sm font-medium" style={{ color: NAVY }}>Drop Word, Excel, PDF or other documents here</div>
        <div className="text-xs text-slate-500 mt-1 mb-3">The AI reads every file, summarizes it and remembers it, so you can ask about it later. Up to 10 MB each.</div>
        <UploadButton onFiles={(f) => uploadMany(f, null)} label="Choose files" />
        {pending.map((p) => <div key={p.key} className="text-xs text-slate-500 mt-2 animate-pulse">Uploading {p.name}…</div>)}
      </div>

      <Card title={`Meeting files (${general.length})`}>{list(general, "No files attached to the meeting itself.")}</Card>

      <Card title={`Agenda items (${items.length})`}>
        {items.length === 0 ? <p className="text-sm text-slate-400">No agenda items yet. Add them from the Agenda page.</p> : (
          <ul className="space-y-4">
            {items.map((it) => (
              <li key={it.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" style={{ color: NAVY }}>{it.title}</span>
                  <Chip tone={it.status === "approved" ? "green" : it.status === "rejected" ? "red" : "gold"}>{it.status === "pending" ? "Awaiting approval" : it.status === "approved" ? "Approved" : "Rejected"}</Chip>
                  <span className="flex-1" />
                  <UploadButton onFiles={(f) => uploadMany(f, it.id)} label="Attach" />
                </div>
                {it.description && <p className="text-xs text-slate-500 mt-1">{it.description}</p>}
                {list(docs.filter((d) => d.agenda_item_id === it.id), "No files attached to this item.")}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
