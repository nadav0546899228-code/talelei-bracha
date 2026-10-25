/** תרומות: נכנסות אוטומטית מהסליקה (נדרים פלוס) או נרשמות ידנית */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, fmtDateTime, post, type Me } from "../api";
import { Chips, ExportBtn, Fab, IconActions, money, SwipeRow } from "../components";
import { useLive } from "../live";
import { buildXlsx, downloadBlob } from "../xlsx";

type Donation = { id: string; amount: number; name: string; phone: string; email: string; comments: string; installments?: number; method?: string; date?: string; source: string; txId?: string; createdAt: string };

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (k: string) => new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(`${k}-15T12:00:00`));

export function DonationsView({ me }: { me: Me }) {
  const [list, setList] = useState<Donation[] | null>(null);
  const [month, setMonth] = useState("all");
  const [q, setQ] = useState("");
  const [add, setAdd] = useState<{ name: string; phone: string; amount: string; method: string; date: string; comments: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const priv = me.user.roles.includes("ceo") || me.user.roles.includes("developer");

  const load = useCallback(() => api<{ donations: Donation[] }>("/api/donations").then((r) => setList(r.donations)).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["donations"], load);

  const dateOf = (d: Donation) => d.date || d.createdAt;
  const months = useMemo(() => Array.from(new Set((list ?? []).map((d) => monthKey(dateOf(d))))).sort().reverse(), [list]);
  const rows = (list ?? []).filter((d) => (month === "all" || monthKey(dateOf(d)) === month) && (!q.trim() || `${d.name} ${d.phone} ${d.email}`.includes(q.trim())));
  const total = rows.reduce((t, d) => t + d.amount, 0);

  const exportXlsx = () => {
    const data = [["תאריך", "שם", "טלפון", "מייל", "סכום", "תשלומים", "הערה", "מקור"], ...rows.map((d) => [dateOf(d).slice(0, 10), d.name, d.phone, d.email, d.amount, d.installments || 1, d.comments, d.source === "manual" ? "ידני" : "סליקה"])];
    downloadBlob(buildXlsx([{ name: "תרומות", rows: data, widths: [12, 22, 14, 24, 12, 8, 30, 8], moneyCols: [4], totalRow: true }]), "תרומות.xlsx");
  };
  const save = async () => {
    if (!add) return;
    try {
      await post("/api/donations", { ...add, amount: Number(add.amount) });
      setAdd(null);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  return (
    <>
      <div className="adm-head">
        <h1>תרומות</h1>
      </div>
      <div className="adm-tiles">
        <div className="adm-tile adm-tile--teal">
          <span className="adm-tile__icon">
            <Icon name="heart" />
          </span>
          <span className="adm-tile__n" style={{ fontSize: "1.3rem" }}>
            {money(total)}
          </span>
          <span className="adm-tile__l">{month === "all" ? "סה״כ" : monthLabel(month)}</span>
        </div>
        <div className="adm-tile">
          <span className="adm-tile__icon">
            <Icon name="users" />
          </span>
          <span className="adm-tile__n">{rows.length}</span>
          <span className="adm-tile__l">תרומות</span>
        </div>
      </div>
      <div className="adm-toolbar" style={{ marginTop: 12 }}>
        <input className="input adm-search" type="search" placeholder="חיפוש תורם" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש תורם" />
        <ExportBtn onClick={exportXlsx} />
      </div>
      {months.length ? <Chips<string> value={month} onChange={setMonth} items={[{ id: "all", label: "הכל" }, ...months.map((m) => ({ id: m, label: monthLabel(m) }))]} /> : null}
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}

      {add ? (
        <section className="adm-panel">
          <h2>רישום תרומה</h2>
          <div className="adm-fields adm-fields--2">
            <label className="field">
              <span className="field__label">שם</span>
              <input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} autoFocus />
            </label>
            <label className="field">
              <span className="field__label">סכום (₪)</span>
              <input className="input" type="number" inputMode="decimal" value={add.amount} onChange={(e) => setAdd({ ...add, amount: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">טלפון</span>
              <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">תאריך</span>
              <input className="input" type="date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} />
            </label>
            <div className="field span-2">
              <span className="field__label">אמצעי</span>
              <Chips<string> value={add.method} onChange={(method) => setAdd({ ...add, method })} items={["מזומן", "צ׳ק", "העברה", "אשראי", "הוראת קבע"].map((x) => ({ id: x, label: x }))} />
            </div>
            <label className="field span-2">
              <span className="field__label">הערה / הקדשה</span>
              <input className="input" value={add.comments} onChange={(e) => setAdd({ ...add, comments: e.target.value })} />
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn--sm" disabled={!Number(add.amount)} onClick={save}>
              <Icon name="check" /> שמירה
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdd(null)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}

      <div className="adm-list">
        {rows.map((d) => (
          <SwipeRow key={d.id} phone={d.phone || undefined} waText={`שלום ${d.name}, תודה רבה על תרומתך!`} tone="green" actions={
              <>
                <IconActions phone={d.phone || undefined} email={d.phone ? undefined : d.email || undefined} waText={`שלום ${d.name}, תודה רבה על תרומתך!`} />
                {priv ? (
                  <button
                    type="button"
                    className="adm-icon-btn adm-icon-btn--danger"
                    aria-label="מחיקת תרומה"
                    onClick={async () => {
                      if (!window.confirm("למחוק את התרומה?")) return;
                      await del(`/api/donations/${d.id}`).catch((x) => setErr(x.message));
                      load();
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                ) : null}
              </>
            }>
            <span className="adm-row__title">
              {d.name || "תורם"} · {money(d.amount)}
            </span>
            <span />
            <span className="adm-row__sub">
              {fmtDateTime(dateOf(d))}
              {d.installments && d.installments > 1 ? ` · ${d.installments} תשלומים` : ""}
              {d.comments ? ` · ${d.comments}` : ""}
              {d.source === "manual" ? ` · ${d.method || "ידני"}` : " · סליקה"}
            </span>
          </SwipeRow>
        ))}
        {list && !rows.length ? <div className="adm-panel adm-empty">אין תרומות להצגה. תרומות מהסליקה נכנסות לכאן לבד אחרי חיבור (מסך מתכנת).</div> : null}
      </div>
      {!add ? <Fab label="רישום תרומה" onClick={() => setAdd({ name: "", phone: "", amount: "", method: "מזומן", date: new Date().toISOString().slice(0, 10), comments: "" })} /> : null}
    </>
  );
}
