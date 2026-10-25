/** מרכז דוחות וייצוא: כל דוח לאקסל בלחיצה, לפי ההרשאות ותחום האחריות (השרת מסנן לפי סניפים) */
import { useState } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { api, fmtDateTime, type Me, type OrgUnit, type Submission, FORM_LABELS, STATUS_LABELS, valueText } from "../api";
import { buildXlsx, downloadBlob } from "../xlsx";
import { ReportsView } from "./ReportsView";

type Ctx = { from: string; to: string };
type Report = { domain?: "kollel" | "bnot"; id: string; title: string; sub: string; icon: IconName; show: (me: Me) => boolean; run: (c: Ctx) => Promise<{ name: string; rows: (string | number)[][]; widths?: number[] }> };

const inRange = (d: string | undefined, c: Ctx) => !d || ((!c.from || d.slice(0, 10) >= c.from) && (!c.to || d.slice(0, 10) <= c.to));
const has = (me: Me, v: string) => me.user.views.includes(v as never);
type Org = { branches: OrgUnit[]; cities: OrgUnit[] };
const place = (o: Org, id: string | null | undefined) => {
  const b = o.branches.find((x) => x.id === id);
  const c = o.cities.find((x) => x.id === b?.parentId);
  return [c?.name || "", b?.name || ""];
};

const REPORTS: Report[] = [
  {
    domain: "kollel", id: "avrechim", title: "אברכים", sub: "שם, טלפון, עיר, סניף, סטטוס", icon: "users", show: (me) => has(me, "kollel"),
    run: async () => {
      const ov = await api<{ avrechim: { name: string; phone: string; branchId: string; active: boolean }[]; branches: OrgUnit[]; cities: OrgUnit[] }>("/api/kollel/overview");
      return { name: "אברכים", widths: [24, 14, 16, 18, 10], rows: [["שם", "טלפון", "עיר", "סניף", "סטטוס"], ...ov.avrechim.map((a) => [a.name, a.phone || "", ...place(ov, a.branchId), a.active ? "פעיל" : "לא פעיל"])] };
    },
  },
  {
    domain: "kollel", id: "attendance", title: "נוכחות בערבי לימוד", sub: "כל מפגש: תאריך, סניף, כמה הגיעו", icon: "calendar", show: (me) => has(me, "kollel"),
    run: async (c) => {
      const [ov, a] = await Promise.all([
        api<{ avrechim: { id: string; name: string }[]; branches: OrgUnit[]; cities: OrgUnit[] }>("/api/kollel/overview"),
        api<{ sessions: { date: string; branchId: string; present: string[]; mPresent?: string[]; byName?: string }[] }>("/api/kollel/attendance"),
      ]);
      const rows = a.sessions.filter((s) => inRange(s.date, c)).sort((x, y) => y.date.localeCompare(x.date));
      return { name: "נוכחות", widths: [12, 16, 18, 10, 10, 50], rows: [["תאריך", "עיר", "סניף", "אברכים", "מתחזקים", "מי הגיע"], ...rows.map((s) => [s.date, ...place(ov, s.branchId), s.present.length, (s.mPresent || []).length, s.present.map((id) => ov.avrechim.find((x) => x.id === id)?.name || "").join(", ")])] };
    },
  },
  ...(["kollel", "bnot"] as const).map((domain): Report => ({
    domain, id: `mitch-${domain}`, title: domain === "kollel" ? "מתחזקים" : "מתחזקות", sub: "שלב, מלווה, קשר אחרון, מעקב הבא", icon: "heart", show: (me) => has(me, domain),
    run: async (c) => {
      const d = await api<{ mitch: { name: string; phone: string; branchId: string; stage: string; status: string; mentor?: string; avrechId?: string | null; lastContact?: string; nextFollowUp?: string | null; startDate?: string; source?: string; log?: unknown[] }[]; branches: OrgUnit[]; cities: OrgUnit[]; avrechim: { id: string; name: string }[] }>(`/api/mitch?domain=${domain}`);
      const rows = d.mitch.filter((m) => inRange(m.startDate, c));
      const st: Record<string, string> = { active: "פעיל", paused: "בהפסקה", left: "עזב" };
      return { name: domain === "kollel" ? "מתחזקים" : "מתחזקות", widths: [22, 14, 14, 16, 18, 18, 10, 12, 12, 12, 8], rows: [["שם", "טלפון", "עיר", "סניף", "שלב", domain === "kollel" ? "לומד עם" : "מלווה", "סטטוס", "התחלה", "קשר אחרון", "מעקב הבא", "רישומי קשר"], ...rows.map((m) => [m.name, m.phone || "", ...place(d, m.branchId), m.stage, domain === "kollel" ? d.avrechim.find((a) => a.id === m.avrechId)?.name || "" : m.mentor || "", st[m.status] || m.status, m.startDate || "", m.lastContact || "", m.nextFollowUp || "", (m.log || []).length])] };
    },
  })),
  {
    domain: "bnot", id: "members", title: "משתתפות בנות צילה", sub: "שם, טלפון, עיר, סניף", icon: "users", show: (me) => has(me, "bnot"),
    run: async () => {
      const d = await api<{ members: { name: string; phone: string; branchId: string; active: boolean; notes?: string }[]; branches: OrgUnit[]; cities: OrgUnit[] }>("/api/bnot/overview");
      return { name: "משתתפות", widths: [24, 14, 16, 18, 10, 30], rows: [["שם", "טלפון", "עיר", "סניף", "סטטוס", "הערות"], ...d.members.map((m) => [m.name, m.phone || "", ...place(d, m.branchId), m.active ? "פעילה" : "לא פעילה", m.notes || ""])] };
    },
  },
  {
    domain: "bnot", id: "activities", title: "פעילויות בנות צילה", sub: "תאריך, סניף, נושא, כמה הגיעו", icon: "calendar", show: (me) => has(me, "bnot"),
    run: async (c) => {
      const d = await api<{ activities: { date: string; branchId: string; title?: string; present?: string[] }[]; branches: OrgUnit[]; cities: OrgUnit[] }>("/api/bnot/overview");
      const rows = d.activities.filter((a) => inRange(a.date, c));
      return { name: "פעילויות", widths: [12, 16, 18, 30, 10], rows: [["תאריך", "עיר", "סניף", "נושא", "משתתפות"], ...rows.map((a) => [a.date, ...place(d, a.branchId), a.title || "", (a.present || []).length])] };
    },
  },
  {
    domain: "bnot", id: "challah", title: "הפרשות חלה", sub: "כל אירוע עם הנרשמות ומי הגיעה", icon: "sparkle", show: (me) => has(me, "bnot"),
    run: async (c) => {
      const d = await api<{ events: { title: string; date: string; place: string; branchId: string; registrations: { name: string; phone: string; arrived: boolean }[] }[]; branches: OrgUnit[]; cities: OrgUnit[] }>("/api/challah");
      const rows: (string | number)[][] = [["תאריך", "אירוע", "מקום", "עיר", "סניף", "נרשמת", "טלפון", "הגיעה"]];
      for (const e of d.events.filter((x) => inRange(x.date, c))) for (const r of e.registrations.length ? e.registrations : [{ name: "", phone: "", arrived: false }]) rows.push([e.date, e.title, e.place || "", ...place(d, e.branchId), r.name, r.phone, r.name ? (r.arrived ? "כן" : "לא") : ""]);
      return { name: "הפרשות חלה", widths: [12, 26, 18, 14, 16, 22, 14, 8], rows };
    },
  },
  {
    id: "inquiries", title: "פניות מהאתר", sub: "צור קשר, התנדבות, עדכונים וסיוע", icon: "inbox", show: (me) => has(me, "inquiries") || has(me, "isha"),
    run: async (c) => {
      const d = await api<{ submissions: Submission[] }>("/api/admin/submissions");
      const rows = d.submissions.filter((s) => inRange(s.createdAt, c));
      return { name: "פניות", widths: [16, 18, 22, 14, 12, 60], rows: [["תאריך", "סוג", "שם", "טלפון", "סטטוס", "פרטים"], ...rows.map((s) => [fmtDateTime(s.createdAt), FORM_LABELS[s.form] || s.form, valueText(s.data.fullName || s.data.name), valueText(s.data.phone), STATUS_LABELS[s.status] || s.status, Object.entries(s.data).map(([k, v]) => `${k}: ${valueText(v)}`).join(" · ")])] };
    },
  },
  {
    id: "broadcast", title: "תפוצות שנשלחו", sub: "ערוץ, קבוצות, כמות, מי שלח", icon: "phone", show: (me) => has(me, "broadcast"),
    run: async (c) => {
      const d = await api<{ broadcasts: { channelLabel: string; text: string; groups: string[]; count: number; byName: string; status: string; createdAt: string }[] }>("/api/broadcast/history");
      const rows = d.broadcasts.filter((b) => inRange(b.createdAt, c));
      return { name: "תפוצות", widths: [16, 10, 30, 8, 18, 10, 50], rows: [["מתי", "ערוץ", "קבוצות", "נמענים", "נשלח ע״י", "סטטוס", "תוכן"], ...rows.map((b) => [fmtDateTime(b.createdAt), b.channelLabel, (b.groups || []).join(", "), b.count, b.byName, b.status, b.text])] };
    },
  },
];

export function ReportsHub({ me, initialTab, mode }: { me: Me; initialTab?: string; mode: "boys" | "girls" }) {
  const charts = mode === "boys" && has(me, "kollel") && me.user.roles.some((r) => ["developer", "ceo", "chief_coordinator", "kollel_region"].includes(r));
  const [tab, setTab] = useState<"export" | "charts">(initialTab === "charts" && charts ? "charts" : "export");
  return (
    <>
      {charts ? (
        <div className="adm-tabs-inline" role="tablist">
          <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "export"} onClick={() => setTab("export")}>
            <Icon name="download" width={16} height={16} /> דוחות וייצוא
          </button>
          <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "charts"} onClick={() => setTab("charts")}>
            <Icon name="grid" width={16} height={16} /> גרפים והשוואות
          </button>
        </div>
      ) : null}
      {tab === "charts" ? <ReportsView /> : <ExportCenter me={me} mode={mode} />}
    </>
  );
}

function ExportCenter({ me, mode }: { me: Me; mode: "boys" | "girls" }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dom = mode === "girls" ? "bnot" : "kollel";
  const list = REPORTS.filter((r) => r.show(me) && (!r.domain || r.domain === dom));

  const run = async (r: Report) => {
    setBusy(r.id);
    setErr(null);
    try {
      const out = await r.run({ from, to });
      const suffix = from || to ? `-${from || "התחלה"}-עד-${to || "היום"}` : "";
      downloadBlob(buildXlsx([{ name: out.name, rows: out.rows, widths: out.widths }]), `${r.title}${suffix}.xlsx`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
    setBusy(null);
  };

  return (
    <>
      <div className="adm-ut-head">
        <div className="adm-ut-title">
          <Icon name="download" />
          <div>
            <h1>דוחות וייצוא</h1>
            <p>כל דוח לאקסל בלחיצה · רק מה שבאחריותך</p>
          </div>
        </div>
      </div>
      <fieldset className="adm-au-range" style={{ marginBottom: 12 }}>
        <legend>טווח תאריכים (לא חובה)</legend>
        <label>
          מתאריך
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          עד תאריך
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {from || to ? (
          <button type="button" className="adm-ut-link" onClick={() => { setFrom(""); setTo(""); }}>
            נקה
          </button>
        ) : null}
      </fieldset>
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
      <div className="adm-xp-grid">
        {list.map((r) => (
          <button key={r.id} type="button" className="adm-xp-card" disabled={busy !== null} onClick={() => run(r)}>
            <span className="adm-xp-card__icon"><Icon name={r.icon} /></span>
            <span className="adm-xp-card__txt">
              <strong>{r.title}</strong>
              <small>{r.sub}</small>
            </span>
            <span className="adm-xp-card__go">{busy === r.id ? "…" : <Icon name="download" />}</span>
          </button>
        ))}
        {!list.length ? <p className="muted">אין דוחות זמינים לתפקיד הזה.</p> : null}
      </div>
    </>
  );
}
