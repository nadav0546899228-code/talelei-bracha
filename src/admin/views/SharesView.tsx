/** שיתופים מהמתחזקים/ות: ממתינים לאישור הרכז/ת ← אישור (נכנס ליומן ולתיעוד) או דחייה */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, fmtDateTime, post } from "../api";
import { Chips, ExportBtn } from "../components";
import { useLive } from "../live";
import { buildXlsx, downloadBlob } from "../xlsx";

export type Share = { id: string; mitchId: string; name: string; domain: "kollel" | "bnot"; branchId: string; text: string; images: string[]; status: "pending" | "approved"; createdAt: string; decidedBy?: string; summary?: string; tags?: string[] };
type Data = { shares: Share[]; ai: boolean; branches: { id: string; name: string }[] };

export function SharesPanel({ domain }: { domain: "kollel" | "bnot" }) {
  const [d, setD] = useState<Data | null>(null);
  const [f, setF] = useState<"pending" | "approved">("pending");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Data>(`/api/shares?domain=${domain}`).then(setD).catch((e) => setErr(e.message)), [domain]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["mitchShares"], load);

  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!d) return <p className="muted">טוען…</p>;
  const bName = (id: string) => d.branches.find((b) => b.id === id)?.name ?? "";
  const pending = d.shares.filter((s) => s.status === "pending");
  const approved = d.shares.filter((s) => s.status === "approved");
  const rows = f === "pending" ? pending : approved;

  const exportXlsx = () => {
    const data = [["תאריך", "שם", "סניף", "שיתוף", "תקציר", "תגיות", "תמונות", "אושר ע״י"], ...approved.map((s) => [s.createdAt.slice(0, 10), s.name, bName(s.branchId), s.text, s.summary || "", (s.tags || []).join(", "), s.images.length, s.decidedBy || ""])];
    downloadBlob(buildXlsx([{ name: "שיתופים", rows: data, widths: [12, 20, 14, 60, 30, 20, 8, 18] }]), "שיתופים.xlsx");
  };

  return (
    <>
      <div className="adm-toolbar">
        <Chips<"pending" | "approved"> value={f} onChange={setF} items={[{ id: "pending", label: "ממתינים לאישור", count: pending.length }, { id: "approved", label: "אושרו", count: approved.length }]} />
        {f === "approved" && approved.length ? <ExportBtn onClick={exportXlsx} /> : null}
      </div>
      <div className="adm-list">
        {rows.map((s) => (
          <ShareCard key={s.id} s={s} ai={d.ai} branch={bName(s.branchId)} reload={load} onErr={setErr} />
        ))}
        {!rows.length ? (
          <div className="adm-panel adm-empty">
            <Icon name="share" width={28} height={28} />
            <div>{f === "pending" ? "אין שיתופים שממתינים לאישור" : "עוד אין שיתופים שאושרו"}</div>
            <div className="muted" style={{ fontSize: "0.9rem" }}>
              שולחים קישור אישי מהכרטיס של {domain === "bnot" ? "המתחזקת" : "המתחזק"} (כפתור וואטסאפ)
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ShareCard({ s, ai, branch, reload, onErr }: { s: Share; ai: boolean; branch: string; reload: () => void; onErr: (e: string) => void }) {
  const [text, setText] = useState(s.text);
  const [meta, setMeta] = useState<{ summary: string; tags: string[] }>({ summary: s.summary || "", tags: s.tags || [] });
  const [busy, setBusy] = useState<"" | "ai" | "save">("");
  const [big, setBig] = useState<string | null>(null);
  const pending = s.status === "pending";

  const act = async (action: "approve" | "reject") => {
    if (action === "reject" && !window.confirm("לדחות? השיתוף יימחק.")) return;
    setBusy("save");
    try {
      await post(`/api/shares/${s.id}`, { action, text, summary: meta.summary, tags: meta.tags });
      reload();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "שגיאה");
    }
    setBusy("");
  };
  const clean = async () => {
    setBusy("ai");
    try {
      const r = await post<{ text: string; summary: string; tags: string[] }>(`/api/shares/${s.id}/ai`, { text });
      setText(r.text);
      setMeta({ summary: r.summary, tags: r.tags });
    } catch (e) {
      onErr(e instanceof Error ? e.message : "שגיאה");
    }
    setBusy("");
  };

  return (
    <section className={`adm-panel adm-share${pending ? " is-pending" : ""}`}>
      <div className="adm-share__head">
        <span className="adm-share__av">
          <Icon name={s.images.length ? "image" : "edit"} width={18} height={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{s.name}</strong>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            {[branch, fmtDateTime(s.createdAt)].filter(Boolean).join(" · ")}
          </div>
        </div>
        {!pending ? (
          <button
            type="button"
            className="adm-icon-btn adm-icon-btn--danger"
            aria-label="מחיקה"
            onClick={async () => {
              if (!window.confirm("למחוק את השיתוף (גם מהיומן)?")) return;
              await del(`/api/shares/${s.id}`).catch((e) => onErr(e.message));
              reload();
            }}
          >
            <Icon name="trash" />
          </button>
        ) : null}
      </div>

      {s.images.length ? (
        <div className="adm-thumbs adm-thumbs--lg">
          {s.images.map((fid) => (
            <button key={fid} type="button" onClick={() => setBig(fid)} aria-label="הגדלת תמונה">
              <img src={`/api/shares/file/${fid}`} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}

      {pending ? (
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} aria-label="טקסט השיתוף" style={{ minHeight: 90 }} />
      ) : text ? (
        <p className="adm-share__text">{text}</p>
      ) : null}
      {meta.summary || meta.tags.length ? (
        <div className="adm-share__meta">
          {meta.summary ? <span><Icon name="sparkle" width={14} height={14} /> {meta.summary}</span> : null}
          {meta.tags.map((t) => (
            <span key={t} className="adm-tag">#{t}</span>
          ))}
        </div>
      ) : null}

      {pending ? (
        <div className="adm-share__acts">
          <button type="button" className="btn btn--sm" disabled={!!busy} onClick={() => act("approve")}>
            <Icon name="check" /> אישור
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={!!busy} onClick={() => act("reject")}>
            <Icon name="close" /> דחייה
          </button>
          {ai && text.trim() ? (
            <button type="button" className="btn btn--ghost btn--sm" disabled={!!busy} onClick={clean}>
              <Icon name="sparkle" /> {busy === "ai" ? "מנקה…" : "ניקוי AI"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: "0.85rem" }}>
          <Icon name="checkCircle" width={14} height={14} style={{ verticalAlign: "-2px" }} /> אושר{s.decidedBy ? ` ע״י ${s.decidedBy}` : ""} · ביומן
        </div>
      )}

      {big ? (
        <div className="adm-lightbox" role="dialog" aria-label="תמונה" onClick={() => setBig(null)}>
          <img src={`/api/shares/file/${big}`} alt="" />
        </div>
      ) : null}
    </section>
  );
}
