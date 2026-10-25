import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, fmtDateTime, post, ROLE_SCOPE, type Me, type Role, type Scope } from "../api";
import { ScopePicker, scopeText, useOrg } from "../org";
import { PhoneUsersPanel } from "./PhoneUsersPanel";
import { enterAs } from "../Impersonate";
import { Fab } from "../components";
import { useLive } from "../live";

type U = { email: string; name: string; phone?: string; picture: string; roles: Role[]; scope?: Scope; active: boolean; bootstrap: boolean; lastLoginAt: string | null };

const ROLE_HELP: Record<Role, string> = {
  developer: "כל התצוגות כולל מתכנת",
  ceo: "כל התצוגות חוץ ממתכנת",
  chief_coordinator: "מעל כל הרכזים בשני התחומים: כל הכולל, משכורות, ערים וסניפים",
  kollel_city: "כולל ערב - כל סניפי העיר שלו: אברכים, דיווחים, מנהלי סניפים",
  kollel_branch: "כולל ערב - הסניף שלו בלבד: דיווח נסיעות והוצאות ותפוצה",
  bnot_city: "בנות צילה - העיר שלה: סניפים, מנהלות ותפוצה",
  bnot_branch: "בנות צילה - הסניף שלה: תפוצה",
  isha_coordinator: "לוח בקרה + אישה לאישה (מידע רגיש) + תפוצה למלוות",
  office: "לוח בקרה + פניות + תפוצה לאנשי קשר",
  content_editor: "לוח בקרה + תוכן האתר",
};

export function UsersView({ me }: { me: Me }) {
  const [users, setUsers] = useState<U[] | null>(null);
  const [editing, setEditing] = useState<{ email: string; name: string; phone: string; roles: Role[]; scope: Scope; active: boolean; isNew: boolean } | null>(null);
  const { org } = useOrg();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => api<{ users: U[] }>("/api/admin/users").then((r) => setUsers(r.users)), []);
  useLive(["users"], load);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setMsg(null);
    try {
      await post("/api/admin/users", editing);
      setMsg({ ok: true, text: "נשמר. המשתמש יוכל להיכנס עם חשבון ה-Google של המייל הזה." });
      setEditing(null);
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };

  const remove = async (email: string) => {
    if (!window.confirm(`להסיר את ${email}? הגישה תיחסם מיד.`)) return;
    try {
      await del(`/api/admin/users/${encodeURIComponent(email)}`);
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>משתמשים והרשאות</h1>
          <p>מי נכנס למערכת ומה כל אחד רואה. כניסה בחשבון Google, או בטלפון וקוד (בתחתית העמוד).</p>
        </div>

      </div>

      {editing ? (
        <section className="adm-panel">
          <h2>{editing.isNew ? "משתמש חדש" : `עריכה: ${editing.email}`}</h2>
          <div className="adm-fields adm-fields--2">
            <label className="field">
              <span className="field__label">מייל Google</span>
              <input className="input" type="email" dir="ltr" style={{ textAlign: "right" }} value={editing.email} disabled={!editing.isNew} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">שם</span>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">טלפון (לתפוצה לרכזים - לא חובה)</span>
              <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </label>
            <fieldset className="field span-2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field__label" style={{ marginBottom: 8 }}>
                תפקידים (אפשר כמה)
              </legend>
              <div className="adm-fields adm-fields--2">
                {me.assignableRoles.map((r) => (
                  <label key={r} className="adm-toggle">
                    <input
                      type="checkbox"
                      checked={editing.roles.includes(r)}
                      onChange={(e) => setEditing({ ...editing, roles: e.target.checked ? [...editing.roles, r] : editing.roles.filter((x) => x !== r) })}
                    />
                    <span>
                      {me.roleLabels[r]}
                      <span className="field__hint" style={{ display: "block" }}>
                        {ROLE_HELP[r]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <ScopePicker roles={editing.roles} scope={editing.scope} onChange={(scope) => setEditing({ ...editing, scope })} org={org} roleLabels={me.roleLabels} />
            <label className="adm-toggle span-2">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              פעיל (ביטול הסימון חוסם כניסה מיד)
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn--sm" onClick={save}>
              שמירה
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}

      {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`} style={{ marginBottom: 14 }}>{msg.text}</div> : null}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">משתמש</th>
              <th scope="col">תפקידים</th>
              <th scope="col">כניסה אחרונה</th>
              <th scope="col">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.email} style={u.active ? undefined : { opacity: 0.55 }}>
                <td>
                  <strong>{u.name || "-"}</strong>
                  <div className="muted" dir="ltr" style={{ textAlign: "right", fontSize: "0.88rem" }}>
                    {u.email}
                  </div>
                  {!u.active ? <span className="adm-status adm-status--archived">חסום</span> : null}
                </td>
                <td>
                  <div className="adm-roles">
                    {u.roles.map((r) => (
                      <span key={r} className={`adm-role adm-role--${r}`}>
                        {me.roleLabels[r]}
                      </span>
                    ))}
                  </div>
                  {u.roles.some((r) => ROLE_SCOPE[r]) ? <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>{scopeText(u.roles, u.scope, org)}</div> : null}
                </td>
                <td>{fmtDateTime(u.lastLoginAt)}</td>
                <td>
                  <div className="adm-item__actions">
                    {me.canImpersonate && u.email !== me.user.email ? (
                      <button type="button" className="adm-icon-btn" title="כניסה כ..." aria-label={`כניסה בשם ${u.name || u.email}`} onClick={() => enterAs(u.email).catch((e) => setMsg({ ok: false, text: e.message }))}>
                        <Icon name="eye" />
                      </button>
                    ) : null}
                    {u.bootstrap ? (
                      <span className="muted" title="משתמש יסוד מוגדר בשרת">
                        <Icon name="lock" width={16} height={16} style={{ display: "inline", verticalAlign: "-3px" }} /> משתמש יסוד
                      </span>
                    ) : (
                      <>
                        <button type="button" className="adm-icon-btn" aria-label={`עריכת ${u.email}`} onClick={() => setEditing({ email: u.email, name: u.name, phone: u.phone || "", roles: u.roles, scope: u.scope || {}, active: u.active, isNew: false })}>
                          <Icon name="edit" />
                        </button>
                        <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label={`הסרת ${u.email}`} onClick={() => remove(u.email)}>
                          <Icon name="trash" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users === null ? <p className="muted">טוען…</p> : null}
      {!editing ? <Fab label="הוספת משתמש Google" onClick={() => setEditing({ email: "", name: "", phone: "", roles: [], scope: {}, active: true, isNew: true })} /> : null}
      <div style={{ marginTop: 20 }}>
        <PhoneUsersPanel me={me} />
      </div>
    </>
  );
}
