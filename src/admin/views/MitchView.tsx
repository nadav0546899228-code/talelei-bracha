/** מתחזקים (כולל ערב - לפי אברך) ומתחזקות (בנות צילה - קשר מתמשך): כרטיס, שלב, יומן קשר ומעקב הבא */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, apiCached, del, post, put, type OrgUnit } from "../api";
import { Chips, Combo, IconActions, SwipeRow, waLink } from "../components";
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
  stageChangedAt?: string;
  daysSinceContact?: number;
  stageDays?: number;
  missedMeetings?: number;
  attention?: { id: string; severity: "high" | "medium"; label: string }[];
  attentionLevel?: "none" | "medium" | "high";
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
type Workflow = { stages: string[]; attention: { contactDays: number; stageDays: number; missedMeetings: number }; whatsappTemplates: string[] };
type AttentionSummary = { total: number; high: number; unassigned: number; followup: number; noContact: number; stageStuck: number; missedMeetings: number };
type MonthStats = { active: number; newThisMonth: number; stageChanges: number; contacts: number };
type Data = {
  mitch: Mitch[];
  branches: OrgUnit[];
  cities: OrgUnit[];
  avrechim: { id: string; name: string; branchId: string }[];
  stages: string[];
  workflow: Workflow;
  canManageWorkflow: boolean;
  attentionSummary: AttentionSummary;
  monthStats: MonthStats;
  contactTypes: string[];
  today: string;
  pendingByMitch: Record<string, number>;
};

/** "היום" / "אתמול" / "לפני 5 ימים" */
const ago = (iso: string, today: string) => {
  const n = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${iso.slice(0, 10)}T12:00:00`).getTime()) / 86400000);
  return n <= 0 ? "היום" : n === 1 ? "אתמול" : `לפני ${n} ימים`;
};
const dayLabel = (iso: string) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "2-digit" }).format(new Date(`${iso}T12:00:00`));
const STATUS: Record<Mitch["status"], string> = { active: "פעיל", paused: "בהפסקה", left: "עזב" };

export function MitchPanel({ domain, initialQ = "", initialTab = "" }: { domain: "kollel" | "bnot"; initialQ?: string; initialTab?: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState(initialQ);
  const [filter, setFilter] = useState<"all" | "due" | "pending" | string>(initialTab === "mitch:due" ? "due" : "all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoNew, setAutoNew] = useState(initialTab === "mitch:new");
  const [pendingCall, setPendingCall] = useState<{ id: string; name: string; type: string; armed: boolean } | null>(null);
  // כשחוזרים לאפליקציה אחרי השיחה - מציגים את השאלה
  useEffect(() => {
    if (!pendingCall || pendingCall.armed) return;
    const arm = () => {
      if (document.visibilityState === "visible") setPendingCall((p) => (p ? { ...p, armed: true } : p));
    };
    const t = window.setTimeout(arm, 2500);
    document.addEventListener("visibilitychange", arm);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [pendingCall]);
  const [sel, setSel] = useState<Mitch | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const word = domain === "kollel" ? { one: "מתחזק", many: "מתחזקים", mentor: "חברותא" } : { one: "מתחזקת", many: "מתחזקות", mentor: "מלווה" };

  const load = useCallback(() => apiCached<Data>(`/api/mitch?domain=${domain}`, setD).catch((e) => setErr(e.message)), [domain]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["mitchazkim", "mitchUpdates", "avrechim", "orgUnits"], load);

  const isDue = useCallback((m: Mitch) => Boolean(d && m.status === "active" && m.nextFollowUp && m.nextFollowUp <= d.today), [d]);
  const rows = useMemo(() => {
    if (!d) return [];
    return d.mitch.filter((m) => {
      if (q.trim() && !`${m.name} ${m.phone}`.includes(q.trim())) return false;
      if (filter === "all") return m.status !== "left";
      if (filter === "attention") return m.status !== "left" && Boolean(m.attention?.length);
      if (filter === "urgent") return m.status !== "left" && m.attentionLevel === "high";
      if (filter === "due") return isDue(m);
      if (filter === "pending") return Boolean(d.pendingByMitch[m.id]);
      if (filter === "left") return m.status === "left";
      return m.stage === filter && m.status !== "left";
    }).sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || Number(b.attentionLevel === "high") - Number(a.attentionLevel === "high"));
  }, [d, q, filter, isDue]);

  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!d) return <p className="muted">טוען…</p>;
  if (!d.branches.length) return <div className="adm-panel adm-empty">אין סניפים באחריותך.</div>;
  const avName = (id: string | null) => d.avrechim.find((a) => a.id === id)?.name ?? "";
  const bName = (id: string) => d.branches.find((b) => b.id === id)?.name ?? "";
  const dueCount = d.mitch.filter(isDue).length;
  const pendingCount = Object.values(d.pendingByMitch || {}).reduce((a, b) => a + b, 0);
  const blank = (): Mitch => ({
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
  });
  if (autoNew) {
    setAutoNew(false);
    setSel(blank());
  }

  const exportXlsx = () => {
    const data = [["שם", "טלפון", "סניף", word.mentor, "שלב", "סטטוס", "קשר אחרון", "מעקב הבא", "דורש טיפול", "מקור"], ...rows.map((m) => [m.name, m.phone, bName(m.branchId), domain === "kollel" ? avName(m.avrechId) : m.mentor, m.stage, STATUS[m.status], m.lastContact || "", m.nextFollowUp || "", (m.attention || []).map((x) => x.label).join(" · "), m.source])];
    downloadBlob(buildXlsx([{ name: word.many, rows: data, widths: [20, 14, 14, 18, 18, 10, 12, 12, 24] }]), `${word.many}.xlsx`);
  };

  return (
    <>
      <div className="adm-mp-bar">
        <label className="adm-ut-search">
          <Icon name="search" />
          <input type="search" placeholder={`חיפוש ${word.one}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`חיפוש ${word.one}`} />
        </label>
        <button type="button" className="adm-ut-act" title="ייצוא לאקסל" aria-label="ייצוא לאקסל" onClick={exportXlsx}><Icon name="download" /></button>
        {d.canManageWorkflow ? (
          <button type="button" className={`adm-ut-act${settingsOpen ? " is-on" : ""}`} title="הגדרות שלבים ומעקב" aria-label="הגדרות שלבים ומעקב" onClick={() => setSettingsOpen(!settingsOpen)}><Icon name="shield" /></button>
        ) : null}
        <button type="button" className="adm-mp-add" title={`הוספת ${word.one}`} aria-label={`הוספת ${word.one}`} onClick={() => setSel(blank())}><Icon name="plus" /></button>
      </div>
      <div className="adm-mp-stats">
        <button type="button" onClick={() => setFilter("all")}><b>{d.monthStats.active}</b> פעילים</button>
        <button type="button" onClick={() => setFilter("all")}><b>{d.monthStats.newThisMonth}</b> חדשים החודש</button>
        <button type="button" className={d.attentionSummary.total ? "is-warn" : ""} onClick={() => setFilter("attention")}><b>{d.attentionSummary.total}</b> לטיפול</button>
        <button type="button" className={dueCount ? "is-red" : ""} onClick={() => setFilter("due")}><b>{dueCount}</b> לחזור היום</button>
      </div>
      <div className="adm-mp-filters">
        {([["due", "לחזור היום", dueCount], ["attention", "לטיפול", d.attentionSummary.total], ["all", "כולם", d.mitch.filter((m) => m.status !== "left").length], ...(pendingCount ? [["pending", "ממתינים לאישור", pendingCount]] : [])] as [string, string, number][]).map(([id, label, n]) => (
          <button key={id} type="button" className={filter === id ? "is-on" : ""} onClick={() => setFilter(id)}>
            {label} <small>{n}</small>
          </button>
        ))}
        <select className={d.stages.includes(filter) || filter === "left" ? "is-on" : ""} value={d.stages.includes(filter) || filter === "left" ? filter : ""} onChange={(e) => setFilter(e.target.value || "all")} aria-label="סינון לפי שלב">
          <option value="">לפי שלב…</option>
          {d.stages.map((st) => <option key={st} value={st}>{st} ({d.mitch.filter((m) => m.stage === st && m.status !== "left").length})</option>)}
          <option value="left">עזבו</option>
        </select>
      </div>
      {d.canManageWorkflow && settingsOpen ? <WorkflowSettings domain={domain} workflow={d.workflow} onSaved={load} startOpen /> : null}
      <div
        className="adm-split"
        onClickCapture={(ev) => {
          // אחרי וואטסאפ/חיוג מהמערכת - כשחוזרים, שאלה קצרה "איך היה?" ונרשם ביומן הקשר
          const a = (ev.target as HTMLElement).closest("a");
          const href = a?.getAttribute("href") || "";
          const id = (ev.target as HTMLElement).closest<HTMLElement>("[data-mitch-id]")?.dataset.mitchId || sel?.id;
          if (!id || !(href.startsWith("tel:") || href.includes("wa.me"))) return;
          const m = d.mitch.find((x) => x.id === id);
          if (m) setPendingCall({ id: m.id, name: m.name, type: href.startsWith("tel:") ? "שיחה" : "הודעה", armed: false });
        }}
      >
        <div className="adm-list">
          {rows.map((m) => {
            const due = isDue(m);
            return (
              <div key={m.id} data-mitch-id={m.id} style={{ display: "contents" }}>
              <SwipeRow
                key={m.id}
                phone={m.phone || undefined}
                waText={`שלום ${m.name}, `}
                tone={m.status === "left" ? "grey" : m.attentionLevel === "high" || due ? "red" : m.attentionLevel === "medium" || m.status === "paused" ? "yellow" : "green"}
                current={sel?.id === m.id}
                onClick={() => setSel({ ...m })}
                actions={<IconActions phone={m.phone || undefined} waText={`שלום ${m.name}, `} />}
              >
                <span className="adm-row__title">{m.name}</span>
                <span />
                <span className="adm-row__sub">
                  <span className="adm-mp-stage" style={{ ["--p" as string]: `${Math.round(((d.stages.indexOf(m.stage) + 1) / d.stages.length) * 100)}%` }}>{m.stage}</span>
                  {due ? " · 📞 לחזור היום" : m.lastContact ? ` · קשר ${ago(m.lastContact, d.today)}` : " · עוד לא היה קשר"}
                  {m.attention?.[0] && !due ? ` · ⚠ ${m.attention[0].label}` : ""}
                  {d.pendingByMitch?.[m.id] ? ` · ✉️ ${d.pendingByMitch[m.id]}` : ""}
                </span>
              </SwipeRow>
              </div>
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
      {pendingCall?.armed ? (
        <QuickLog
          name={pendingCall.name}
          onClose={() => setPendingCall(null)}
          onPick={async (note, next) => {
            const id = pendingCall.id;
            setPendingCall(null);
            const plus = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
            await post(`/api/mitch/${id}/log`, { type: pendingCall.type, note, nextFollowUp: next ? plus(next) : undefined }).catch((e) => setErr(e.message));
            load();
          }}
        />
      ) : null}
    </>
  );
}

/** "איך היה?" אחרי שיחה/וואטסאפ - שלוש לחיצות מהירות במקום טופס */
function QuickLog({ name, onPick, onClose }: { name: string; onPick: (note: string, nextDays: number | null) => void; onClose: () => void }) {
  return (
    <div className="adm-instsheet" role="dialog" aria-label="רישום קשר מהיר" onClick={onClose}>
      <div className="adm-instsheet__card adm-ql" onClick={(e) => e.stopPropagation()}>
        <h2>איך היה עם {name}?</h2>
        <div className="adm-ql__grid">
          <button type="button" onClick={() => onPick("דיברנו", null)}><span>✅</span>דיברנו</button>
          <button type="button" onClick={() => onPick("לא ענה", 1)}><span>📵</span>לא ענה · לנסות מחר</button>
          <button type="button" onClick={() => onPick("דיברנו", 7)}><span>📅</span>לחזור בעוד שבוע</button>
          <button type="button" onClick={() => onPick("דיברנו", 30)}><span>🗓️</span>לחזור בעוד חודש</button>
        </div>
        <button type="button" className="adm-instsheet__later" onClick={onClose}>דלג</button>
      </div>
    </div>
  );
}

function WorkflowSettings({ domain, workflow, onSaved, startOpen = false }: { domain: "kollel" | "bnot"; workflow: Workflow; onSaved: () => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [stages, setStages] = useState(workflow.stages.join("\n"));
  const [attention, setAttention] = useState({ ...workflow.attention });
  const [templates, setTemplates] = useState(workflow.whatsappTemplates.join("\n"));
  const [msg, setMsg] = useState("");
  const save = async () => {
    try {
      const nextStages = stages.split(/\n/).map((x) => x.trim()).filter(Boolean);
      await put(`/api/mitch/settings?domain=${domain}`, { stages: nextStages, attention, whatsappTemplates: templates.split(/\n/).map((x) => x.trim()).filter(Boolean) });
      setMsg("נשמר");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "השמירה נכשלה");
    }
  };
  return (
    <section className="adm-workflow-settings">
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(!open)}>
        <Icon name="edit" /> הגדרות תהליך ומעקב
      </button>
      {open ? (
        <div className="adm-panel">
          <div className="adm-panel__head"><div><h3>שלבים וכללי תשומת לב</h3><small>המערכת תזהה אוטומטית מי דורש טיפול לפי הכללים האלה.</small></div></div>
          <div className="adm-fields adm-fields--2">
            <label className="field span-2"><span className="field__label">שלבי התהליך — שלב בכל שורה</span><textarea className="textarea" value={stages} onChange={(e) => setStages(e.target.value)} rows={Math.max(4, workflow.stages.length)} /></label>
            <label className="field"><span className="field__label">ללא קשר — אחרי כמה ימים</span><input className="input" type="number" min={1} max={365} value={attention.contactDays} onChange={(e) => setAttention({ ...attention, contactDays: Number(e.target.value) })} /></label>
            <label className="field"><span className="field__label">תקוע באותו שלב — ימים</span><input className="input" type="number" min={1} max={730} value={attention.stageDays} onChange={(e) => setAttention({ ...attention, stageDays: Number(e.target.value) })} /></label>
            {domain === "kollel" ? <label className="field"><span className="field__label">נעדר ברצף — מספר מפגשים</span><input className="input" type="number" min={1} max={12} value={attention.missedMeetings} onChange={(e) => setAttention({ ...attention, missedMeetings: Number(e.target.value) })} /></label> : null}
            <label className="field span-2"><span className="field__label">תבניות WhatsApp — תבנית בכל שורה. אפשר להשתמש ב־{"{שם}"}</span><textarea className="textarea" rows={Math.max(3, workflow.whatsappTemplates.length)} value={templates} onChange={(e) => setTemplates(e.target.value)} /></label>
          </div>
          <div className="btn-row"><button type="button" className="btn btn--sm" onClick={save}><Icon name="check" /> שמירה</button>{msg ? <span className="muted">{msg}</span> : null}</div>
        </div>
      ) : null}
    </section>
  );
}

function MitchCard({ d, m: initial, domain, word, onClose, onSaved }: { d: Data; m: Mitch; domain: "kollel" | "bnot"; word: { one: string; many: string; mentor: string }; onClose: () => void; onSaved: (id?: string) => void }) {
  const [m, setM] = useState<Mitch>(initial);
  const [log, setLog] = useState({ type: d.contactTypes[0], note: "", next: "" });
  const [err, setErr] = useState<string | null>(null);
  const [updates, setUpdates] = useState<SelfUpdate[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [transferReason, setTransferReason] = useState("");
  const [waTemplate, setWaTemplate] = useState(d.workflow.whatsappTemplates[0] || "שלום {שם}, ");
  const originalAvrechId = initial.avrechId;
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
    const waWindow = window.open("about:blank", "_blank");
    try {
      const r = await post<{ token: string }>(`/api/mitch/${m.id}/access-link`, {});
      const url = `${window.location.origin}/share?t=${encodeURIComponent(r.token)}`;
      const msg = `שלום ${m.name}, זה הקישור האישי שלך לעדכונים במערכת. אפשר לכתוב ולצרף תמונות בלבד. הקישור אישי ואין להעביר אותו לאחרים:\n${url}`;
      const target = waLink(m.phone, msg);
      if (waWindow) waWindow.location.href = target;
      else window.location.href = target;
    } catch (e) {
      waWindow?.close();
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
      const r = await post<{ id: string }>("/api/mitch", { ...m, domain, transferReason });
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

      {m.id && live?.attention?.length ? (
        <div className={`adm-mitch-attention ${live.attentionLevel === "high" ? "is-high" : ""}`}>
          <strong><Icon name="alert" /> דורש תשומת לב</strong>
          <div>{live.attention.map((a) => <span key={a.id}>{a.label}</span>)}</div>
        </div>
      ) : null}

      {m.id ? (
        <>
          {m.phone ? (
            <div className="adm-mitch-wa-tools">
              <div>
                <strong>WhatsApp מהיר</strong>
                <small>בחירת תבנית פותחת WhatsApp בלבד — השליחה ידנית.</small>
              </div>
              <select className="select" value={waTemplate} onChange={(e) => setWaTemplate(e.target.value)}>
                {d.workflow.whatsappTemplates.map((t, i) => <option value={t} key={i}>{t.replace("{שם}", m.name)}</option>)}
              </select>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.open(waLink(m.phone, waTemplate.replaceAll("{שם}", m.name)), "_blank", "noopener,noreferrer")}>
                <Icon name="whatsapp" /> פתיחת הודעה
              </button>
            </div>
          ) : null}

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
        {domain === "kollel" && m.id && originalAvrechId !== m.avrechId ? (
          <label className="field span-2">
            <span className="field__label">סיבת שינוי השיוך (נשמרת לבקרת מתכנת בלבד)</span>
            <input className="input" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder="לא חובה" />
          </label>
        ) : null}
        <div className="field span-2">
          <span className="field__label">שלב</span>
          <div className="adm-stage-progress" aria-label="התקדמות בתהליך">
            {d.stages.map((s, i) => {
              const current = d.stages.indexOf(m.stage);
              return <button key={s} type="button" className={i < current ? "is-done" : i === current ? "is-current" : ""} onClick={() => setM({ ...m, stage: s })}><i>{i + 1}</i><span>{s}</span></button>;
            })}
          </div>
          {live?.stageDays !== undefined ? <small className="muted">בשלב הנוכחי {live.stageDays} ימים</small> : null}
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
