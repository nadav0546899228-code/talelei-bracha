/** מתחזקים (כולל ערב - לפי אברך) ומתחזקות (בנות צילה - קשר מתמשך): כרטיס, שלב, יומן קשר ומעקב הבא */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, post, type OrgUnit } from "../api";
import { Chips, Combo, ExportBtn, Fab, IconActions, SwipeRow, waLink } from "../components";
import { useLive } from "../live";
import { buildXlsx, downloadBlob } from "../xlsx";

export type Mitch = {
  id: string;
  domain: "kollel" | "bnot";
  name: string;
  phone: string;
  branchId: string;
  avrechId: string | null;
  mentor: string;
  stage: string;
  status: "active" | "paused" | "left";
  nextFollowUp: string | null;
  lastContact?: string;
  source: string;
  notes: string;
  startDate: string;
  log: { id: string; date: string; type: string; note: string; by: string; updateId?: string }[];
};
type SelfUpdate = {
  id: string;
  text: string;
  photos: string[];
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};
type Data = { mitch: Mitch[]; branches: OrgUnit[]; cities: OrgUnit[]; avrechim: { id: string; name: string; branchId: string }[]; stages: string[]; contactTypes: string[]; today: string };

const dayLabel = (iso: string) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "2-digit" }).format(new Date(`${iso}T12:00:00`));
const STATUS: Record<Mitch["status"], string> = { active: "פעיל", paused: "בהפסקה", left: "עזב" };

export function MitchPanel({ domain, initialQ = "" }: { domain: "kollel" | "bnot"; initialQ?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState(initialQ);
  const [filter, setFilter] = useState<"all" | "due" | string>("all");
  const [sel, setSel] = useState<Mitch | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const word = domain === "kollel" ? { one: "מתחזק", many: "מתחזקים", mentor: "חברותא" } : { one: "מתחזקת", many: "מתחזקות", mentor: "מלווה" };

  const load = useCallback(() => api<Data>(`/api/mitch?domain=${domain}`).then(setD).catch((e) => setErr(e.message)), [domain]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["mitchazkim", "avrechim", "orgUnits"], load);

  const isDue = useCallback((m: Mitch) => Boolean(d && m.status === "active" && m.nextFollowUp && m.nextFollowUp <= d.today), [d]);
  const rows = useMemo(() => {
    if (!d) return [];
    return d.mitch.filter((m) => {
      if (q.trim() && !`${m.name} ${m.phone}`.includes(q.trim())) return false;
      if (filter === "all") return m.status !== "left";
      if (filter === "due") return isDue(m);
      if (filter === "left") return m.status === "left";
      return m.stage === filter && m.status !== "left";
    });
  }, [d, q, filter, isDue]);

  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!d) return <p className="muted">טוען…</p>;
  if (!d.branches.length) return <div className="adm-panel adm-empty">אין סניפים באחריותך.</div>;
  const avName = (id: string | null) => d.avrechim.find((a) => a.id === id)?.name ?? "";
  const bName = (id: string) => d.branches.find((b) => b.id === id)?.name ?? "";
  const dueCount = d.mitch.filter(isDue).length;

  const exportXlsx = () => {
    const data = [["שם", "טלפון", "סניף", word.mentor, "שלב", "סטטוס", "קשר אחרון", "מעקב הבא", "מקור"], ...rows.map((m) => [m.name, m.phone, bName(m.branchId), domain === "kollel" ? avName(m.avrechId) : m.mentor, m.stage, STATUS[m.status], m.lastContact || "", m.nextFollowUp || "", m.source])];
    downloadBlob(buildXlsx([{ name: word.many, rows: data, widths: [20, 14, 14, 18, 18, 10, 12, 12, 24] }]), `${word.many}.xlsx`);
  };

  return (
    <>
      <div className="adm-toolbar">
        <input className="input adm-search" type="search" placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`חיפוש ${word.one}`} />
        <ExportBtn onClick={exportXlsx} />
      </div>
      <Chips<string>
        value={filter}
        onChange={setFilter}
        items={[
          { id: "all", label: "כולם", count: d.mitch.filter((m) => m.status !== "left").length },
          { id: "due", label: "לחזור אליהם", count: dueCount },
          ...d.stages.map((s) => ({ id: s, label: s, count: d.mitch.filter((m) => m.stage === s && m.status !== "left").length })),
          { id: "left", label: "עזבו" },
        ]}
      />
      <div className="adm-split">
        <div className="adm-list">
          {rows.map((m) => {
            const due = isDue(m);
            return (
              <SwipeRow
                key={m.id}
                phone={m.phone || undefined}
                waText={`שלום ${m.name}, `}
                tone={m.status === "left" ? "grey" : due ? "red" : m.status === "paused" ? "yellow" : "green"}
                current={sel?.id === m.id}
                onClick={() => setSel({ ...m })}
                actions={<IconActions phone={m.phone || undefined} waText={`שלום ${m.name}, `} />}
              >
                <span className="adm-row__title">{m.name}</span>
                <span />
                <span className="adm-row__sub">
                  {m.stage}
                  {domain === "kollel" && m.avrechId ? ` · עם ${avName(m.avrechId)}` : m.mentor ? ` · ${m.mentor}` : ""}
                  {m.nextFollowUp ? ` · ${due ? "לחזור!" : "מעקב"} ${dayLabel(m.nextFollowUp)}` : ""}
                </span>
              </SwipeRow>
            );
          })}
          {!rows.length ? <div className="adm-panel adm-empty">אין {word.many} להצגה.</div> : null}
        </div>
        {sel ? (
          <MitchCard key={sel.id || "new"} d={d} m={sel} domain={domain} word={word} onClose={() => setSel(null)} onSaved={(id) => load().then(() => id && setSel((x) => (x ? { ...x, id } : x)))} />
        ) : (
          <div className="adm-panel adm-empty adm-detail-empty">
            <Icon name="users" />
          </div>
        )}
      </div>
      {!sel ? (
        <Fab
          label={`הוספת ${word.one}`}
          onClick={() =>
            setSel({
              id: "",
              domain,
              name: "",
              phone: "",
              branchId: d.branches.length === 1 ? d.branches[0].id : "",
              avrechId: null,
              mentor: "",
              stage: d.stages[0],
              status: "active",
              nextFollowUp: null,
              source: "",
              notes: "",
              startDate: d.today,
              log: [],
            })
          }
        />
      ) : null}
    </>
  );
}

function MitchCard({ d, m: initial, domain, word, onClose, onSaved }: { d: Data; m: Mitch; domain: "kollel" | "bnot"; word: { one: string; many: string; mentor: string }; onClose: () => void; onSaved: (id?: string) => void }) {
  const [m, setM] = useState<Mitch>(initial);
  const [log, setLog] = useState({ type: d.contactTypes[0], note: "", next: "" });
  const [err, setErr] = useState<string | null>(null);
  const [updates, setUpdates] = useState<SelfUpdate[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const live = d.mitch.find((x) => x.id === m.id);
  const entries = live?.log ?? m.log ?? [];

  const loadUpdates = useCallback(() => {
    if (!m.id) return Promise.resolve();
    return api<{ updates: SelfUpdate[] }>(`/api/mitch/${m.id}/updates`).then((r) => setUpdates(r.updates));
  }, [m.id]);
  useEffect(() => {
    loadUpdates().catch(() => undefined);
  }, [loadUpdates]);
  useLive(["mitchUpdates"], loadUpdates);

  const sendPersonalLink = async () => {
    if (!m.id) return;
    if (!m.phone) {
      setErr("חסר מספר טלפון לשליחת הקישור");
      return;
    }
    setLinkBusy(true);
    setErr(null);
    try {
      const r = await post<{ token: string }>(`/api/mitch/${m.id}/access-link`, {});
      const url = `${window.location.origin}/share?t=${encodeURIComponent(r.token)}`;
      const who = domain === "bnot" ? "מתחזקת" : "מתחזק";
      const msg = `שלום ${m.name}, זה הקישור האישי שלך לעדכונים במערכת. אפשר לכתוב ולצרף תמונות בלבד. הקישור אישי ואין להעביר אותו לאחרים:\n${url}`;
      window.open(waLink(m.phone, msg), "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "לא ניתן ליצור קישור");
    } finally {
      setLinkBusy(false);
    }
  };

  const reviewUpdate = async (id: string, action: "approve" | "reject") => {
    try {
      await post(`/api/mitch/updates/${id}/${action}`, {});
      await loadUpdates();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "הפעולה נכשלה");
    }
  };

  const save = async () => {
    setErr(null);
    try {
      const r = await post<{ id: string }>("/api/mitch", { ...m, domain });
      onSaved(r.id);
      if (!m.id) setM({ ...m, id: r.id });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const addLog = async () => {
    if (!m.id) return;
    try {
      await post(`/api/mitch/${m.id}/log`, { type: log.type, note: log.note, nextFollowUp: log.next || undefined });
      setLog({ ...log, note: "", next: "" });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  return (
    <section className="adm-panel adm-detail is-open" aria-label={`כרטיס ${word.one}`}>
      <div className="adm-panel__head">
        <h2>{m.id ? m.name : `${word.one} חדש${domain === "bnot" ? "ה" : ""}`}</h2>
        <button type="button" className="adm-icon-btn adm-sheet-back" aria-label="סגירה" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}

      {m.id ? (
        <>
          <div className="adm-mitch-share-tools">
            <div>
              <strong>קישור אישי לעדכונים</strong>
              <small>כניסה בלי סיסמה · טקסט ותמונות בלבד · כל עדכון דורש אישור</small>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" disabled={linkBusy} onClick={sendPersonalLink}>
              <Icon name="whatsapp" /> {linkBusy ? "יוצר קישור…" : "שליחת קישור אישי"}
            </button>
          </div>

          {updates.filter((u) => u.status === "pending").length ? (
            <section className="adm-mitch-pending">
              <div className="adm-mitch-pending__head">
                <strong>ממתין לאישור</strong>
                <span>{updates.filter((u) => u.status === "pending").length}</span>
              </div>
              {updates.filter((u) => u.status === "pending").map((u) => (
                <article key={u.id} className="adm-mitch-update">
                  <div className="adm-mitch-update__meta">
                    <Icon name="clock" />
                    {new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(u.submittedAt))}
                  </div>
                  {u.text ? <p>{u.text}</p> : null}
                  {u.photos?.length ? (
                    <div className="adm-mitch-update__photos">
                      {u.photos.map((src, i) => <img key={i} src={src} alt={`תמונה שצורפה ${i + 1}`} />)}
                    </div>
                  ) : null}
                  <div className="btn-row">
                    <button type="button" className="btn btn--sm" onClick={() => reviewUpdate(u.id, "approve")}><Icon name="check" /> אישור והכנסה למעקב</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => reviewUpdate(u.id, "reject")}><Icon name="close" /> דחייה</button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          <div className="adm-quicklog">
          <Chips<string> value={log.type} onChange={(type) => setLog({ ...log, type })} items={d.contactTypes.map((t) => ({ id: t, label: t }))} />
          <textarea className="textarea" style={{ minHeight: 60 }} placeholder="מה היה? (לא חובה)" value={log.note} onChange={(e) => setLog({ ...log, note: e.target.value })} />
          <div className="adm-toolbar" style={{ marginBottom: 0 }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="field__label">לחזור אליו{domain === "bnot" ? "ה" : ""} ב-</span>
              <input className="input" type="date" value={log.next} onChange={(e) => setLog({ ...log, next: e.target.value })} />
            </label>
            <button type="button" className="btn btn--sm" onClick={addLog} style={{ alignSelf: "end" }}>
              <Icon name="check" /> רישום קשר
            </button>
          </div>
        </div>
        </>
      ) : null}

      <div className="adm-fields adm-fields--2" style={{ marginTop: 12 }}>
        <label className="field">
          <span className="field__label">שם</span>
          <input className="input" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">טלפון</span>
          <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={m.phone} onChange={(e) => setM({ ...m, phone: e.target.value })} />
        </label>
        <div className="field">
          <span className="field__label">סניף</span>
          <Combo label="סניף" value={m.branchId} onChange={(branchId) => setM({ ...m, branchId, avrechId: null })} options={d.branches.map((b) => ({ id: b.id, label: b.name, sub: d.cities.find((c) => c.id === b.parentId)?.name }))} />
        </div>
        {domain === "kollel" ? (
          <div className="field">
            <span className="field__label">לומד עם (אברך)</span>
            <Combo label="אברך" value={m.avrechId ?? ""} onChange={(avrechId) => setM({ ...m, avrechId: avrechId || null })} options={d.avrechim.filter((a) => !m.branchId || a.branchId === m.branchId).map((a) => ({ id: a.id, label: a.name }))} />
          </div>
        ) : (
          <label className="field">
            <span className="field__label">מלווה</span>
            <input className="input" value={m.mentor} onChange={(e) => setM({ ...m, mentor: e.target.value })} />
          </label>
        )}
        <div className="field span-2">
          <span className="field__label">שלב</span>
          <Chips<string> value={m.stage} onChange={(stage) => setM({ ...m, stage })} items={d.stages.map((s) => ({ id: s, label: s }))} />
        </div>
        <div className="field">
          <span className="field__label">סטטוס</span>
          <Chips<Mitch["status"]> value={m.status} onChange={(status) => setM({ ...m, status })} items={(Object.keys(STATUS) as Mitch["status"][]).map((s) => ({ id: s, label: STATUS[s] }))} />
        </div>
        <label className="field">
          <span className="field__label">מעקב הבא</span>
          <input className="input" type="date" value={m.nextFollowUp ?? ""} onChange={(e) => setM({ ...m, nextFollowUp: e.target.value || null })} />
        </label>
        <label className="field span-2">
          <span className="field__label">הגיע/ה דרך</span>
          <input className="input" value={m.source} placeholder={domain === "kollel" ? "חבר, שיעור, שכן..." : "הפרשת חלה, שיעור, חברה..."} onChange={(e) => setM({ ...m, source: e.target.value })} />
        </label>
        <label className="field span-2">
          <span className="field__label">הערות</span>
          <textarea className="textarea" value={m.notes} onChange={(e) => setM({ ...m, notes: e.target.value })} />
        </label>
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--sm" disabled={!m.name.trim() || !m.branchId} onClick={save}>
          <Icon name="check" /> שמירה
        </button>
        {m.id ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={async () => {
              if (!window.confirm(`להסיר את ${m.name}?`)) return;
              await del(`/api/mitch/${m.id}`);
              onClose();
              onSaved();
            }}
          >
            <Icon name="trash" /> הסרה
          </button>
        ) : null}
      </div>

      {entries.length ? (
        <div className="adm-hist">
          <h3 className="adm-subhead">
            <Icon name="clock" width={18} height={18} style={{ verticalAlign: "-3px" }} /> יומן קשר
          </h3>
          {entries.map((e) => (
            <div key={e.id} className="adm-hist__ent" style={{ display: "block" }}>
              <strong>
                {dayLabel(e.date)} · {e.type}
              </strong>
              <span className="muted"> · {e.by}</span>
              {e.note ? <div>{e.note}</div> : null}
              {e.updateId ? (() => {
                const u = updates.find((x) => x.id === e.updateId && x.status === "approved");
                return u?.photos?.length ? (
                  <div className="adm-mitch-update__photos adm-mitch-update__photos--history">
                    {u.photos.map((src, i) => <img key={i} src={src} alt={`תמונה מאושרת ${i + 1}`} />)}
                  </div>
                ) : null;
              })() : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
