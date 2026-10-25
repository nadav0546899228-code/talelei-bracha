import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api } from "../api";

type Transfer = {
  id: string;
  mitchId: string;
  mitchName: string;
  branchId: string;
  fromAvrechId: string | null;
  fromAvrechName: string;
  toAvrechId: string | null;
  toAvrechName: string;
  reason?: string;
  at: string;
  byName: string;
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

export function MitchTransferAudit() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(() => {
    setBusy(true);
    setErr("");
    return api<{ transfers: Transfer[] }>("/api/mitch/transfers")
      .then((r) => setRows(r.transfers))
      .catch((e) => setErr(e instanceof Error ? e.message : "שגיאה"))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="adm-panel">
      <div className="adm-panel__head">
        <div>
          <h2>היסטוריית העברות בין אברכים</h2>
          <p className="muted">מידע חסוי למתכנת בלבד. משתמשים אחרים אינם מקבלים את הנתונים מהשרת.</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={busy}>
          <Icon name="refresh" /> {busy ? "טוען…" : "רענון"}
        </button>
      </div>
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
      {!err && !busy ? (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>מועד</th>
                <th>מתחזק</th>
                <th>מאברך</th>
                <th>לאברך</th>
                <th>סיבה</th>
                <th>בוצע על ידי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td>{fmt(x.at)}</td>
                  <td><strong>{x.mitchName}</strong></td>
                  <td>{x.fromAvrechName || "ללא שיוך"}</td>
                  <td>{x.toAvrechName || "ללא שיוך"}</td>
                  <td>{x.reason || "—"}</td>
                  <td>{x.byName || "—"}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={6} className="muted">עדיין לא בוצעו העברות.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
