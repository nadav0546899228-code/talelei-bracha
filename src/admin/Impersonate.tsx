/** "כניסה כ..." - מנכ״ל ומתכנת נכנסים לתצוגה של משתמש אחר או של תפקיד, עם ההרשאות שלו */
import { useEffect, useMemo, useState } from "react";
import { api, post, type Domain, type Me, type OrgUnit, type Role, type Scope } from "./api";
import { scopeText } from "./org";

type Targets = {
  people: { id: string; name: string; email: string; phone: string; kind: "google" | "phone"; roles: Role[]; scope: Scope }[];
  roles: { id: Role; label: string; scope: { domain: Domain; level: "city" | "branch" } | null }[];
  cities: OrgUnit[];
  branches: OrgUnit[];
};

/** סדר הצגה - מלמעלה למטה בהיררכיה */
const ORDER: Role[] = ["developer", "ceo", "chief_coordinator", "kollel_city", "bnot_city", "kollel_branch", "bnot_branch", "isha_coordinator", "office", "content_editor"];
const rank = (roles: Role[]) => Math.min(...roles.map((r) => ORDER.indexOf(r)).filter((i) => i >= 0), 99);

export function ImpersonateModal({ me, onClose, onSwitched }: { me: Me; onClose: () => void; onSwitched: () => void }) {
  const [t, setT] = useState<Targets | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [unit, setUnit] = useState("");

  useEffect(() => {
    api<Targets>("/api/admin/impersonation-targets")
      .then(setT)
      .catch((e) => setErr(e.message));
  }, []);

  const people = useMemo(() => {
    if (!t) return [];
    const s = q.trim();
    return t.people
      .filter((p) => p.id !== me.user.id && (!s || `${p.name} ${p.email} ${p.phone}`.includes(s)))
      .sort((a, b) => rank(a.roles) - rank(b.roles) || a.name.localeCompare(b.name, "he"));
  }, [t, q, me.user.id]);

  const go = async (id: string) => {
    setErr(null);
    try {
      await post("/api/auth/impersonate", { id });
      onSwitched();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const roleDef = t?.roles.find((r) => r.id === role);
  const units = roleDef?.scope ? (roleDef.scope.level === "city" ? t!.cities : t!.branches).filter((u) => u.domain === roleDef.scope!.domain) : [];
  const cityName = (id: string | null) => t?.cities.find((c) => c.id === id)?.name ?? "";
  const virtualId = role ? `role:${role}${roleDef?.scope ? `:${unit}` : ""}` : "";

  return (
    <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="כניסה כ...">
      <div className="adm-modal adm-modal--wide">
        <div className="adm-panel__head">
          <h2>כניסה כ...</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            סגירה
          </button>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          רואים בדיוק את מה שהמשתמש רואה, עם ההרשאות שלו. כל פעולה נרשמת ביומן על שמך. חוזרים בלחיצה על "חזרה לחשבון שלי".
        </p>
        {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
        {!t && !err ? <p className="muted">טוען…</p> : null}
        {t ? (
          <>
            <h3 className="adm-subhead">משתמש מסוים</h3>
            <input className="input" type="search" placeholder="חיפוש לפי שם, מייל או טלפון" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש משתמש" />
            <div className="adm-list adm-as-list">
              {people.map((p) => (
                <button key={p.id} type="button" className="adm-row adm-row--btn" onClick={() => go(p.id)}>
                  <span className="adm-row__title">{p.name || p.email || p.phone}</span>
                  <span className="muted" dir="ltr" style={{ fontSize: "0.85rem" }}>
                    {p.kind === "google" ? p.email : p.phone}
                  </span>
                  <span className="adm-row__sub">
                    {p.roles.map((r) => me.roleLabels[r]).join(" · ")}
                    {scopeText(p.roles, p.scope, t) ? ` · ${scopeText(p.roles, p.scope, t)}` : ""}
                  </span>
                </button>
              ))}
              {!people.length ? <p className="muted">אין משתמשים מתאימים.</p> : null}
            </div>

            <h3 className="adm-subhead">תצוגה לפי תפקיד</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              לבדיקה גם כשעדיין אין אדם בתפקיד.
            </p>
            <div className="adm-fields adm-fields--2">
              <label className="field">
                <span className="field__label">תפקיד</span>
                <select
                  className="select"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value as Role);
                    setUnit("");
                  }}
                >
                  <option value="">בחירה…</option>
                  {[...t.roles]
                    .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                </select>
              </label>
              {roleDef?.scope ? (
                <label className="field">
                  <span className="field__label">{roleDef.scope.level === "city" ? "עיר" : "סניף"}</span>
                  <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                    <option value="">בחירה…</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.type === "branch" ? ` (${cityName(u.parentId)})` : ""}
                      </option>
                    ))}
                  </select>
                  {!units.length ? <span className="field__hint">אין עדיין {roleDef.scope.level === "city" ? "ערים" : "סניפים"} בתחום הזה.</span> : null}
                </label>
              ) : null}
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--sm" disabled={!role || (Boolean(roleDef?.scope) && !unit)} onClick={() => go(virtualId)}>
                כניסה לתצוגה
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
