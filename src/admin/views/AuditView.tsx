import { useEffect, useMemo, useState } from "react";
import { api, fmtDateTime } from "../api";

type Entry = { id: string; at: string; email: string; action: string; target: string; details: Record<string, unknown> };

export function AuditView() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<{ entries: Entry[] }>("/api/admin/audit").then((r) => setEntries(r.entries));
  }, []);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (entries ?? []).filter((e) => !t || `${e.email} ${e.action} ${e.target}`.toLowerCase().includes(t));
  }, [entries, q]);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>יומן פעולות</h1>
          <p>כניסות, עדכוני פניות, שינויי תוכן והרשאות - 500 הפעולות האחרונות.</p>
        </div>
      </div>
      <div className="adm-toolbar">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי משתמש או פעולה" aria-label="חיפוש ביומן" />
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">מתי</th>
              <th scope="col">מי</th>
              <th scope="col">פעולה</th>
              <th scope="col">יעד</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(e.at)}</td>
                <td dir="ltr" style={{ textAlign: "right" }}>
                  {e.email}
                </td>
                <td>{e.action}</td>
                <td>{e.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries === null ? <p className="muted">טוען…</p> : !rows.length ? <p className="adm-empty">אין רשומות.</p> : null}
    </>
  );
}
