import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, type Role } from "../api";
import { DevExtras } from "./DevExtras";
import { MitchTransferAudit } from "./MitchTransferAudit";
import type { AdminCtx } from "../AdminApp";

type System = {
  env: string;
  node: string;
  uptimeSec: number;
  storage: "postgres" | "file";
  counts: Record<string, number>;
  checks: { key: string; ok: boolean; note: string }[];
  bootstrap: { developer: string[]; ceo: string[] };
  roles: Record<Role, { label: string; views: string[] }>;
};

export function DeveloperView({ me, openImpersonate }: AdminCtx) {
  const [sys, setSys] = useState<System | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<System>("/api/admin/system").then(setSys).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!sys) return <p className="muted">טוען…</p>;

  const fmtUp = (s: number) => (s > 86400 ? `${Math.floor(s / 86400)} ימים` : s > 3600 ? `${Math.floor(s / 3600)} שעות` : `${Math.floor(s / 60)} דקות`);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>מתכנת</h1>
          <p>מצב המערכת, חיבורים, גיבוי ובדיקת הרשאות.</p>
        </div>
        <a className="btn btn--sm" href="/api/admin/export" download>
          <Icon name="download" />
          גיבוי מלא (JSON)
        </a>
      </div>

      <div className="adm-stats">
        <div className="adm-stat">
          <div className="adm-stat__n" style={{ fontSize: "1.3rem" }}>{sys.env === "production" ? "ייצור" : "פיתוח"}</div>
          <div className="adm-stat__l">סביבה</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat__n" style={{ fontSize: "1.3rem" }}>{sys.storage === "postgres" ? "PostgreSQL" : "קובץ מקומי"}</div>
          <div className="adm-stat__l">אחסון</div>
        </div>
        <div className="adm-stat">
          <div className="adm-stat__n" style={{ fontSize: "1.3rem" }}>{fmtUp(sys.uptimeSec)}</div>
          <div className="adm-stat__l">זמן פעילות · Node {sys.node}</div>
        </div>
        {Object.entries(sys.counts).map(([k, n]) => (
          <div className="adm-stat" key={k}>
            <div className="adm-stat__n">{n}</div>
            <div className="adm-stat__l" dir="ltr" style={{ textAlign: "right" }}>
              {k}
            </div>
          </div>
        ))}
      </div>

      <section className="adm-panel">
        <h2>בדיקות והגדרות</h2>
        {sys.checks.map((c) => (
          <div key={c.key} className={`adm-check ${c.ok ? "adm-check--ok" : "adm-check--bad"}`}>
            <span className="adm-check__dot">
              <Icon name={c.ok ? "check" : "alert"} />
            </span>
            <div>
              <code>{c.key}</code>
              <div>
                <span>{c.ok ? "מוגדר" : "חסר"} · {c.note}</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      <DevExtras />

      <MitchTransferAudit />

      <section className="adm-panel">
        <h2>כניסה כ...</h2>
        <p className="muted">כניסה לתצוגה של מנכ״ל, רכז ראשי, רכז עיר או מנהל סניף - בדיוק מה שהוא רואה, עם ההרשאות שלו. כל כניסה נרשמת ביומן.</p>
        <div className="adm-toolbar">
          <button type="button" className="btn btn--sm" onClick={openImpersonate}>
            <Icon name="eye" /> בחירת משתמש או תפקיד
          </button>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">תפקיד</th>
                <th scope="col">תצוגות</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(sys.roles) as Role[]).map((r) => (
                <tr key={r}>
                  <td>
                    <span className={`adm-role adm-role--${r}`}>{sys.roles[r].label}</span>
                  </td>
                  <td>{sys.roles[r].views.map((v) => me.viewLabels[v as keyof typeof me.viewLabels]).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adm-panel">
        <h2>משתמשי יסוד (מוגדרים בשרת)</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0 }}>
          <dt className="muted">מתכנת</dt>
          <dd style={{ margin: 0 }} dir="ltr">
            {sys.bootstrap.developer.join(", ")}
          </dd>
          <dt className="muted">מנכ״ל</dt>
          <dd style={{ margin: 0 }} dir="ltr">
            {sys.bootstrap.ceo.join(", ")}
          </dd>
        </dl>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          לשינוי: משתני הסביבה <code>DEVELOPER_EMAILS</code> / <code>CEO_EMAILS</code> (מופרדים בפסיק).
        </p>
      </section>

      <section className="adm-panel">
        <h2>נקודות קצה (API)</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <tbody>
              {[
                ["POST /api/forms/:id", "קבלת טפסים מהאתר (מוגבל קצב)"],
                ["GET /api/public/bootstrap", "תוכן ציבורי + הגדרות כניסה"],
                ["POST /api/auth/google", "כניסה עם Google"],
                ["GET /api/admin/submissions", "פניות לפי הרשאה"],
                ["PUT /api/admin/content", "שמירת תוכן האתר"],
                ["GET /api/admin/export", "גיבוי מלא - מתכנת בלבד"],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td dir="ltr" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <code>{a}</code>
                  </td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
