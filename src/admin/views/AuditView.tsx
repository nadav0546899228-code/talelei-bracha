/**
 * יומן פעולות - כמו בנוסעים בן טובים:
 * סינון לפי משתמש, פעולה, טווח תאריכים ו"רק כניסה בשם", טבלה (זמן · משתמש · פעולה · יעד · פרטים),
 * ייצוא לאקסל, ולמתכנת: בחירה מרובה, מחיקה והורדת גיבוי.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api } from "../api";
import { ExportBtn } from "../components";
import { buildXlsx, downloadBlob } from "../xlsx";

type Entry = { id: string; at: string; email: string; action: string; target: string; details: Record<string, unknown> };

const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(iso));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateOf = (iso: string) => new Date(iso).toLocaleDateString("he-IL");
/** "מי ← בתור מי" כשמנכ״ל/מתכנת נכנסו בשם מישהו */
const split = (who: string) => {
  const i = who.indexOf(" ← בתור ");
  return i < 0 ? { actor: who, real: "" } : { actor: who.slice(i + 8), real: who.slice(0, i) };
};
const detailText = (d: Record<string, unknown> | undefined) => {
  if (!d || typeof d !== "object") return "";
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 300);
};

export function AuditView() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [who, setWho] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [asOnly, setAsOnly] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(200);

  const load = useCallback(() => {
    setErr(null);
    api<{ entries: Entry[]; canDelete?: boolean }>("/api/admin/audit")
      .then((r) => {
        setEntries(r.entries);
        setCanDelete(Boolean(r.canDelete));
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const users = useMemo(() => [...new Set((entries ?? []).map((e) => split(e.email).actor))].sort((a, b) => a.localeCompare(b, "he")), [entries]);
  const actions = useMemo(() => [...new Set((entries ?? []).map((e) => e.action))].sort((a, b) => a.localeCompare(b, "he")), [entries]);
  const rangeBad = Boolean(from && to && to < from);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (entries ?? []).filter((e) => {
      const s = split(e.email);
      if (who && s.actor !== who) return false;
      if (action && e.action !== action) return false;
      if (asOnly && !s.real) return false;
      if (!rangeBad && from && day(e.at) < from) return false;
      if (!rangeBad && to && day(e.at) > to) return false;
      if (t && !`${e.email} ${e.action} ${e.target} ${detailText(e.details)}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [entries, who, action, asOnly, from, to, q, rangeBad]);
  const shown = rows.slice(0, limit);

  useEffect(() => {
    setSel(new Set());
  }, [who, action, asOnly, from, to, q]);

  const exportXlsx = () => {
    const data = [["תאריך", "שעה", "משתמש", "בפועל (כניסה בשם)", "פעולה", "יעד", "פרטים"], ...rows.map((e) => {
      const s = split(e.email);
      return [dateOf(e.at), timeOf(e.at), s.actor, s.real, e.action, e.target, detailText(e.details)];
    })];
    downloadBlob(buildXlsx([{ name: "יומן פעולות", rows: data, widths: [12, 10, 26, 26, 26, 30, 50] }]), `יומן-פעולות-${day(new Date().toISOString())}.xlsx`);
  };
  const backup = (list: Entry[]) => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries: list }, null, 2)], { type: "application/json" });
    downloadBlob(blob, `audit-backup-${day(new Date().toISOString())}.json`);
  };
  const remove = async (scope: "selected" | "filtered") => {
    const list = scope === "selected" ? rows.filter((e) => sel.has(e.id)) : rows;
    if (!list.length) return;
    if (!window.confirm(`למחוק ${list.length} רשומות מהיומן? כדאי להוריד גיבוי קודם.`)) return;
    try {
      await api("/api/admin/audit", { method: "DELETE", body: JSON.stringify({ ids: list.map((e) => e.id) }) });
      setSel(new Set());
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const allShownSelected = shown.length > 0 && shown.every((e) => sel.has(e.id));

  return (
    <>
      <div className="adm-ut-head">
        <div className="adm-ut-title">
          <Icon name="list" />
          <div>
            <h1>יומן פעולות</h1>
            <p>כל פעולה במערכת: מי, מתי ומה</p>
          </div>
        </div>
        <div className="adm-ut-tools">
          <ExportBtn onClick={exportXlsx} />
        </div>
      </div>

      <div className="adm-ut-filters adm-au-filters">
        <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="משתמש">
          <option value="">כל המשתמשים</option>
          {users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select className="select" value={action} onChange={(e) => setAction(e.target.value)} aria-label="פעולה">
          <option value="">כל הפעולות</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <fieldset className="adm-au-range">
          <legend>טווח תאריכים</legend>
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
              נקה טווח
            </button>
          ) : null}
        </fieldset>
        <label className="adm-au-check">
          <input type="checkbox" checked={asOnly} onChange={(e) => setAsOnly(e.target.checked)} />
          רק פעולות בכניסה בשם
        </label>
        <label className="adm-ut-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש חופשי…" aria-label="חיפוש ביומן" />
        </label>
        <button type="button" className="adm-ut-act" title="רענון" aria-label="רענון" onClick={load}>
          <Icon name="refresh" />
        </button>
      </div>
      {rangeBad ? <p className="adm-ut-red" role="alert">"עד תאריך" לא יכול להיות לפני "מתאריך".</p> : null}
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}

      {canDelete && sel.size ? (
        <div className="adm-au-bar">
          <strong>נבחרו {sel.size} רשומות</strong>
          <button type="button" className="btn btn--sm adm-au-del" onClick={() => remove("selected")}>
            <Icon name="trash" /> מחיקת הנבחרות
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => backup(rows.filter((e) => sel.has(e.id)))}>
            <Icon name="download" /> הורדת גיבוי
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSel(new Set())}>
            ביטול בחירה
          </button>
        </div>
      ) : null}

      {entries === null && !err ? <p className="muted">טוען…</p> : null}
      {entries ? (
        <>
          <p className="adm-au-count">
            <span>{rows.length} פעולות תואמות · מוצגות {shown.length}</span>
            {canDelete && rows.length ? (
              <>
                <button type="button" className="adm-ut-link" onClick={() => backup(rows)}>
                  <Icon name="download" /> גיבוי כל התואמות
                </button>
                <button type="button" className="adm-ut-link adm-ut-red" onClick={() => remove("filtered")}>
                  <Icon name="trash" /> מחיקת כל {rows.length} התואמות
                </button>
              </>
            ) : null}
          </p>
          <div className="adm-ut-wrap">
            <table className="adm-ut adm-au">
              <thead>
                <tr>
                  {canDelete ? (
                    <th style={{ width: 34 }}>
                      <input
                        type="checkbox"
                        aria-label="סימון כל המוצגות"
                        checked={allShownSelected}
                        onChange={(e) => setSel(e.target.checked ? new Set(shown.map((x) => x.id)) : new Set())}
                      />
                    </th>
                  ) : null}
                  <th>זמן</th>
                  <th>משתמש</th>
                  <th>פעולה</th>
                  <th>יעד</th>
                  <th>פרטים</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const s = split(e.email);
                  const on = sel.has(e.id);
                  return (
                    <tr
                      key={e.id}
                      className={on ? "is-sel" : ""}
                      onClick={canDelete ? (ev) => {
                        if ((ev.target as HTMLElement).closest("a,button,input")) return;
                        const n = new Set(sel);
                        if (on) n.delete(e.id);
                        else n.add(e.id);
                        setSel(n);
                      } : undefined}
                    >
                      {canDelete ? (
                        <td>
                          <input
                            type="checkbox"
                            checked={on}
                            aria-label="בחירת רשומה"
                            onChange={(ev) => {
                              const n = new Set(sel);
                              if (ev.target.checked) n.add(e.id);
                              else n.delete(e.id);
                              setSel(n);
                            }}
                          />
                        </td>
                      ) : null}
                      <td className="adm-au-time">
                        {timeOf(e.at)}
                        <small>{dateOf(e.at)}</small>
                      </td>
                      <td className="adm-au-who">
                        {s.actor || "—"}
                        {s.real ? <small>בכניסה בשם ({s.real})</small> : null}
                      </td>
                      <td>
                        <span className="adm-au-chip">{e.action}</span>
                      </td>
                      <td className="adm-au-target">{e.target}</td>
                      <td className="adm-au-detail" title={detailText(e.details)}>{detailText(e.details)}</td>
                    </tr>
                  );
                })}
                {!shown.length ? (
                  <tr>
                    <td colSpan={canDelete ? 6 : 5} className="adm-ut-empty">
                      אין פעולות תואמות. נסו לשנות את הסינון.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {rows.length > shown.length ? (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLimit(limit + 300)}>
                הצגת עוד ({rows.length - shown.length})
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
