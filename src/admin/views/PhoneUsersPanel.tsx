/** ניהול משתמשי טלפון + קוד (רכזים ומנהלי סניפים). הקוד מוצג פעם אחת בלבד בעת יצירה/איפוס. */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, fmtDateTime, post, ROLE_SCOPE, type Me, type Role, type Scope } from "../api";
import { ScopePicker, scopeText, useOrg, type OrgData } from "../org";
import { ContactActions } from "../components";

type PU = {
  id: string;
  name: string;
  phone: string;
  roles: Role[];
  scope?: Scope;
  active: boolean;
  lastLoginAt?: string;
  mustChangeCode?: boolean;
  lock: { locked: boolean; permanent?: boolean; minutes?: number };
};

const PHONE_ROLES: Role[] = ["chief_coordinator", "kollel_city", "kollel_branch", "bnot_city", "bnot_branch", "isha_coordinator", "office", "content_editor", "ceo"];

type Edit = { id?: string; name: string; phone: string; roles: Role[]; scope: Scope; active: boolean };

export function PhoneUsersPanel({ me, onChange, title = "כניסה בטלפון וקוד", org: orgProp }: { me: Me; onChange?: () => void; title?: string; org?: OrgData | null }) {
  const own = useOrg(!orgProp);
  const org = orgProp ?? own.org;
  const [users, setUsers] = useState<PU[] | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [shownCode, setShownCode] = useState<{ name: string; phone: string; code: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const roles = PHONE_ROLES.filter((r) => me.assignableRoles.includes(r));

  const load = useCallback(() => api<{ users: PU[] }>("/api/admin/phone-users").then((r) => setUsers(r.users)), []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!edit) return;
    setErr(null);
    try {
      const r = await post<{ code: string | null }>("/api/admin/phone-users", edit);
      if (r.code) setShownCode({ name: edit.name, phone: edit.phone, code: r.code });
      setEdit(null);
      await load();
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const action = async (u: PU, kind: "reset-code" | "unlock" | "delete") => {
    if (kind === "delete" && !window.confirm(`למחוק את ${u.name}? הגישה תיחסם מיד.`)) return;
    if (kind === "reset-code" && !window.confirm(`להפיק קוד חדש ל${u.name}? הקוד הישן יפסיק לעבוד.`)) return;
    try {
      if (kind === "delete") await del(`/api/admin/phone-users/${u.id}`);
      else {
        const r = await post<{ code?: string }>(`/api/admin/phone-users/${u.id}/${kind}`, {});
        if (r.code) setShownCode({ name: u.name, phone: u.phone, code: r.code });
      }
      await load();
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const loginUrl = `${window.location.origin}/admin`;

  return (
    <section className="adm-panel">
      <div className="adm-panel__head">
        <h2>{title}</h2>
        <button type="button" className="btn btn--sm" onClick={() => setEdit({ name: "", phone: "", roles: roles.length === 1 ? roles : [], scope: {}, active: true })}>
          <Icon name="plus" /> הוספה
        </button>
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        למי שאין חשבון Google. הקוד נוצר אוטומטית, מוצג פעם אחת, ובכניסה הראשונה המשתמש מתבקש להחליף אותו. 5 ניסיונות שגויים נועלים ל-15 דקות; 5 נעילות בחודש נועלות עד שחרור.
      </p>

      {edit ? (
        <div className="adm-item" style={{ marginBottom: 12 }}>
          <div className="adm-fields adm-fields--2">
            <label className="field">
              <span className="field__label">שם</span>
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">טלפון</span>
              <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </label>
            <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field__label" style={{ marginBottom: 6 }}>
                תפקיד
              </legend>
              <div className="adm-toolbar">
                {roles.map((r) => (
                  <label key={r} className="adm-toggle">
                    <input
                      type="checkbox"
                      checked={edit.roles.includes(r)}
                      onChange={(e) => setEdit({ ...edit, roles: e.target.checked ? [...edit.roles, r] : edit.roles.filter((x) => x !== r) })}
                    />
                    {me.roleLabels[r]}
                  </label>
                ))}
              </div>
            </fieldset>
            <ScopePicker roles={edit.roles} scope={edit.scope} onChange={(scope) => setEdit({ ...edit, scope })} org={org} roleLabels={me.roleLabels} />
            <label className="adm-toggle span-2">
              <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
              פעיל
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn--sm" onClick={save}>
              שמירה
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>
              ביטול
            </button>
          </div>
        </div>
      ) : null}
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}

      <div className="adm-list">
        {(users ?? []).map((u) => (
          <div key={u.id} className={`adm-row adm-row--tone-${!u.active ? "grey" : u.lock.locked ? "red" : u.mustChangeCode ? "yellow" : "green"}`} style={{ cursor: "default" }}>
            <span className="adm-row__title">
              {u.name} <span className="muted" dir="ltr" style={{ fontWeight: 500 }}>{u.phone}</span>
            </span>
            <span className="adm-item__actions">
              {u.lock.locked ? (
                <button type="button" className="btn btn--sm btn--rose" onClick={() => action(u, "unlock")}>
                  שחרור נעילה
                </button>
              ) : null}
              <button type="button" className="adm-icon-btn" title="עריכה" aria-label={`עריכת ${u.name}`} onClick={() => setEdit({ id: u.id, name: u.name, phone: u.phone, roles: u.roles, scope: u.scope || {}, active: u.active })}>
                <Icon name="edit" />
              </button>
              <button type="button" className="adm-icon-btn" title="קוד חדש" aria-label={`קוד חדש ל${u.name}`} onClick={() => action(u, "reset-code")}>
                <Icon name="refresh" />
              </button>
              <button type="button" className="adm-icon-btn adm-icon-btn--danger" title="מחיקה" aria-label={`מחיקת ${u.name}`} onClick={() => action(u, "delete")}>
                <Icon name="trash" />
              </button>
            </span>
            <span className="adm-row__sub">
              {u.roles.map((r) => me.roleLabels[r]).join(" · ")}
              {u.roles.some((r) => ROLE_SCOPE[r]) ? ` · ${scopeText(u.roles, u.scope, org)}` : ""} · כניסה אחרונה: {fmtDateTime(u.lastLoginAt)}
              {u.lock.locked ? (u.lock.permanent ? " · נעול עד שחרור" : ` · נעול עוד ${u.lock.minutes} דק׳`) : u.mustChangeCode ? " · טרם החליף קוד" : ""}
            </span>
          </div>
        ))}
        {users && !users.length ? <p className="muted">אין עדיין משתמשים.</p> : null}
      </div>

      {shownCode ? (
        <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="קוד כניסה">
          <div className="adm-modal">
            <h2>קוד הכניסה של {shownCode.name}</h2>
            <p className="muted">הקוד מוצג עכשיו בלבד ולא יישמר במערכת. בכניסה הראשונה יתבקש להחליף אותו.</p>
            <div className="adm-code">{shownCode.code}</div>
            <ContactActions
              phone={shownCode.phone}
              waText={`שלום ${shownCode.name}, פרטי הכניסה למערכת הניהול של טללי ברכה:\n${loginUrl}\nכניסה בטלפון וקוד - קוד: ${shownCode.code}\nבכניסה הראשונה תתבקש לבחור קוד אישי.`}
              smsText={`כניסה למערכת: ${loginUrl} קוד: ${shownCode.code}`}
            />
            <div className="btn-row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShownCode(null)}>
                סגירה
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
