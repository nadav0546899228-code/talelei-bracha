/**
 * ניהול משתמשים - טבלה אחת כמו בנוסעים בן טובים:
 * שם · טלפון · תפקיד · קוד כניסה · ניסיונות/נעילה · סטטוס · כניסה אחרונה · פעולות.
 * משתמשי Google ומשתמשי טלפון+קוד באותה טבלה.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { api, del, fmtDateTime, post, ROLE_SCOPE, type Me, type Role, type Scope } from "../api";
import { ScopePicker, scopeText, useOrg } from "../org";
import { enterAs } from "../Impersonate";
import { ContactActions, ExportBtn } from "../components";
import { useLive } from "../live";
import { buildXlsx, downloadBlob } from "../xlsx";

type GU = { email: string; name: string; phone?: string; picture: string; roles: Role[]; scope?: Scope; active: boolean; bootstrap: boolean; lastLoginAt: string | null };
type PU = {
  id: string;
  name: string;
  phone: string;
  roles: Role[];
  scope?: Scope;
  active: boolean;
  lastLoginAt?: string;
  mustChangeCode?: boolean;
  failedAttempts?: number;
  lock: { locked: boolean; permanent?: boolean; minutes?: number };
};
type Row = {
  key: string;
  kind: "google" | "phone";
  name: string;
  email: string;
  phone: string;
  roles: Role[];
  scope: Scope;
  active: boolean;
  bootstrap: boolean;
  lastLoginAt: string | null;
  mustChangeCode: boolean;
  failed: number;
  lock: PU["lock"] | null;
  asId: string;
  raw: GU | PU;
};
type Edit = { kind: "google" | "phone"; isNew: boolean; id?: string; email: string; name: string; phone: string; roles: Role[]; scope: Scope; active: boolean };

const ROLE_HELP: Partial<Record<Role, string>> = {
  developer: "הכל כולל מתכנת",
  ceo: "הכל חוץ ממתכנת",
  chief_coordinator: "כל האזורים, הערים והסניפים",
  kollel_region: "כולל ערב - האזור שלו",
  bnot_region: "בנות צילה - האזור שלה",
  kollel_city: "כולל ערב - העיר שלו",
  kollel_branch: "כולל ערב - הסניף שלו",
  bnot_city: "בנות צילה - העיר שלה",
  bnot_branch: "בנות צילה - הסניף שלה",
  bnot_caller: "המשתתפות שהוקצו לה",
  isha_coordinator: "אישה לאישה",
  office: "פניות ותפוצה",
  content_editor: "תוכן האתר",
};

export function UsersView({ me }: { me: Me }) {
  const { org } = useOrg();
  const [gu, setGu] = useState<GU[] | null>(null);
  const [pu, setPu] = useState<PU[] | null>(null);
  const [q, setQ] = useState("");
  const [roleF, setRoleF] = useState<string>("all");
  const [statusF, setStatusF] = useState<"all" | "active" | "off" | "locked">("all");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [shownCode, setShownCode] = useState<{ name: string; phone: string; code: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canGoogle = me.user.views.includes("users");

  const load = useCallback(() => {
    if (canGoogle) api<{ users: GU[] }>("/api/admin/users").then((r) => setGu(r.users)).catch(() => setGu([]));
    else setGu([]);
    api<{ users: PU[] }>("/api/admin/phone-users").then((r) => setPu(r.users)).catch(() => setPu([]));
  }, [canGoogle]);
  useLive(["users", "phoneUsers"], load);
  useEffect(() => {
    load();
  }, [load]);

  const rows: Row[] = useMemo(() => {
    const g: Row[] = (gu ?? []).map((u) => ({
      key: `g:${u.email}`, kind: "google", name: u.name, email: u.email, phone: u.phone || "", roles: u.roles, scope: u.scope || {}, active: u.active,
      bootstrap: u.bootstrap, lastLoginAt: u.lastLoginAt, mustChangeCode: false, failed: 0, lock: null, asId: u.email, raw: u,
    }));
    const p: Row[] = (pu ?? []).map((u) => ({
      key: `p:${u.id}`, kind: "phone", name: u.name, email: "", phone: u.phone, roles: u.roles, scope: u.scope || {}, active: u.active,
      bootstrap: false, lastLoginAt: u.lastLoginAt || null, mustChangeCode: Boolean(u.mustChangeCode), failed: u.failedAttempts || 0, lock: u.lock, asId: `phone:${u.id}`, raw: u,
    }));
    return [...g, ...p].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, "he"));
  }, [gu, pu]);

  const filtered = rows.filter((r) => {
    const t = q.trim();
    if (t && !`${r.name} ${r.email} ${r.phone}`.toLowerCase().includes(t.toLowerCase())) return false;
    if (roleF !== "all" && !r.roles.includes(roleF as Role)) return false;
    if (statusF === "active" && !r.active) return false;
    if (statusF === "off" && r.active) return false;
    if (statusF === "locked" && !r.lock?.locked) return false;
    return true;
  });
  const activeCount = rows.filter((r) => r.active).length;
  const roleOptions = [...new Set(rows.flatMap((r) => r.roles))];

  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });

  const saveEdit = async () => {
    if (!edit) return;
    setMsg(null);
    try {
      if (edit.kind === "google") {
        await post("/api/admin/users", { email: edit.email, name: edit.name, phone: edit.phone, roles: edit.roles, scope: edit.scope, active: edit.active });
        setMsg({ ok: true, text: edit.isNew ? "נוסף. ייכנס עם חשבון ה-Google של המייל." : "נשמר" });
      } else {
        const r = await post<{ code: string | null }>("/api/admin/phone-users", { id: edit.id, name: edit.name, phone: edit.phone, roles: edit.roles, scope: edit.scope, active: edit.active });
        if (r.code) setShownCode({ name: edit.name, phone: edit.phone, code: r.code });
        else setMsg({ ok: true, text: "נשמר" });
      }
      setEdit(null);
      load();
    } catch (e) {
      fail(e);
    }
  };

  const toggleActive = async (r: Row) => {
    if (r.active && !window.confirm(`להשבית את ${r.name || r.email}? הכניסה תיחסם מיד.`)) return;
    try {
      if (r.kind === "google") await post("/api/admin/users", { email: r.email, name: r.name, phone: r.phone, roles: r.roles, scope: r.scope, active: !r.active });
      else await post("/api/admin/phone-users", { id: (r.raw as PU).id, name: r.name, phone: r.phone, roles: r.roles, scope: r.scope, active: !r.active });
      load();
    } catch (e) {
      fail(e);
    }
  };
  const phoneAction = async (r: Row, kind: "reset-code" | "unlock") => {
    if (kind === "reset-code" && !window.confirm(`להפיק קוד חדש ל${r.name}? הקוד הישן יפסיק לעבוד.`)) return;
    try {
      const res = await post<{ code?: string }>(`/api/admin/phone-users/${(r.raw as PU).id}/${kind}`, {});
      if (res.code) setShownCode({ name: r.name, phone: r.phone, code: res.code });
      load();
    } catch (e) {
      fail(e);
    }
  };
  const remove = async (r: Row) => {
    if (!window.confirm(`למחוק את ${r.name || r.email}? הגישה תיחסם מיד.`)) return;
    try {
      if (r.kind === "google") await del(`/api/admin/users/${encodeURIComponent(r.email)}`);
      else await del(`/api/admin/phone-users/${(r.raw as PU).id}`);
      load();
    } catch (e) {
      fail(e);
    }
  };

  const exportXlsx = () => {
    const data = [
      ["שם", "מייל", "טלפון", "כניסה", "תפקידים", "שיוך", "סטטוס", "כניסה אחרונה"],
      ...filtered.map((r) => [
        r.name, r.email, r.phone, r.kind === "google" ? "Google" : "טלפון וקוד", r.roles.map((x) => me.roleLabels[x]).join(", "),
        r.roles.some((x) => ROLE_SCOPE[x]) ? scopeText(r.roles, r.scope, org) : "", r.active ? (r.lock?.locked ? "נעול" : "פעיל") : "מושבת", r.lastLoginAt ? fmtDateTime(r.lastLoginAt) : "",
      ]),
    ];
    downloadBlob(buildXlsx([{ name: "משתמשים", rows: data, widths: [22, 28, 14, 12, 34, 28, 10, 18] }]), "משתמשים.xlsx");
  };

  const editable = (r: Row) => !r.bootstrap && r.roles.every((x) => me.assignableRoles.includes(x));
  const assignable = (kind: "google" | "phone") => me.assignableRoles.filter((r) => kind === "google" || r !== "developer");

  const act = (icon: IconName, label: string, onClick: () => void, tone = "") => (
    <button type="button" className={`adm-ut-act${tone ? ` adm-ut-act--${tone}` : ""}`} title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );

  return (
    <>
      <div className="adm-ut-head">
        <div className="adm-ut-title">
          <Icon name="shield" />
          <div>
            <h1>ניהול משתמשים</h1>
            <p>{activeCount} משתמשים פעילים · {rows.length} בסה״כ</p>
          </div>
        </div>
        <div className="adm-ut-tools">
          <ExportBtn onClick={exportXlsx} />
          <button type="button" className="btn btn--sm" onClick={() => setNewOpen(true)}>
            <Icon name="plus" /> משתמש חדש
          </button>
        </div>
      </div>

      <div className="adm-ut-filters">
        <label className="adm-ut-search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם, טלפון או מייל…" aria-label="חיפוש משתמש" />
        </label>
        <select className="select" value={roleF} onChange={(e) => setRoleF(e.target.value)} aria-label="סינון לפי תפקיד">
          <option value="all">כל התפקידים</option>
          {roleOptions.map((r) => <option key={r} value={r}>{me.roleLabels[r]}</option>)}
        </select>
        <select className="select" value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)} aria-label="סינון לפי סטטוס">
          <option value="all">כל הסטטוסים</option>
          <option value="active">פעילים</option>
          <option value="off">מושבתים</option>
          <option value="locked">נעולים</option>
        </select>
        <button type="button" className="adm-ut-act" title="רענון" aria-label="רענון" onClick={load}>
          <Icon name="refresh" />
        </button>
      </div>

      {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`} style={{ marginBottom: 12 }}>{msg.text}</div> : null}

      <div className="adm-ut-wrap">
        <table className="adm-ut">
          <thead>
            <tr>
              <th>שם</th>
              <th><Icon name="phone" /> טלפון</th>
              <th>תפקיד</th>
              <th><Icon name="lock" /> קוד כניסה</th>
              <th>ניסיונות / נעילה</th>
              <th>סטטוס</th>
              <th>כניסה אחרונה</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.key} className={!r.active ? "is-off" : r.lock?.locked ? "is-locked" : ""}>
                <td>
                  <div className="adm-ut-name">{r.name || "—"}</div>
                  {r.email ? <div className="adm-ut-sub" dir="ltr">{r.email}</div> : null}
                  {r.bootstrap ? <div className="adm-ut-sub"><Icon name="lock" /> משתמש יסוד</div> : null}
                </td>
                <td className="adm-ut-mono" dir="ltr">{r.phone || <span className="adm-ut-dim">—</span>}</td>
                <td>
                  <div className="adm-ut-roles">
                    {r.roles.map((x) => <span key={x} className={`adm-ut-pill adm-ut-pill--${x}`}>{me.roleLabels[x]}</span>)}
                  </div>
                  {r.roles.some((x) => ROLE_SCOPE[x]) ? <div className="adm-ut-sub">{scopeText(r.roles, r.scope, org)}</div> : null}
                </td>
                <td>
                  {r.kind === "google" ? (
                    <span className="adm-ut-dim">Google</span>
                  ) : editable(r) ? (
                    <button type="button" className="adm-ut-link" onClick={() => phoneAction(r, "reset-code")}>
                      <Icon name="refresh" /> קוד חדש
                    </button>
                  ) : (
                    <span className="adm-ut-dim">—</span>
                  )}
                  {r.mustChangeCode ? <div className="adm-ut-sub adm-ut-warn">טרם החליף קוד</div> : null}
                </td>
                <td>
                  {r.lock?.locked ? (
                    <span className="adm-ut-red"><Icon name="alert" /> {r.lock.permanent ? "נעול עד שחרור" : `נעול עוד ${r.lock.minutes} דק׳`}</span>
                  ) : r.failed > 0 ? (
                    <span className="adm-ut-warn">{r.failed} ניסיונות כושלים</span>
                  ) : (
                    <span className="adm-ut-dim">—</span>
                  )}
                </td>
                <td>{r.active ? <span className="adm-ut-st adm-ut-st--on">פעיל</span> : <span className="adm-ut-st adm-ut-st--off">מושבת</span>}</td>
                <td className="adm-ut-date">{r.lastLoginAt ? fmtDateTime(r.lastLoginAt) : "—"}</td>
                <td>
                  <div className="adm-ut-acts">
                    {editable(r) ? act("edit", "עריכת פרטים ותפקיד", () => setEdit({ kind: r.kind, isNew: false, id: r.kind === "phone" ? (r.raw as PU).id : undefined, email: r.email, name: r.name, phone: r.phone, roles: r.roles, scope: r.scope, active: r.active })) : null}
                    {r.lock?.locked && editable(r) ? act("lock", "שחרור נעילה", () => phoneAction(r, "unlock"), "warn") : null}
                    {editable(r) ? act(r.active ? "close" : "check", r.active ? "השבתה" : "הפעלה", () => toggleActive(r), r.active ? "danger" : "ok") : null}
                    {me.canImpersonate && r.asId !== me.user.id && r.active ? act("eye", `כניסה בשם ${r.name || r.email}`, () => enterAs(r.asId).catch(fail)) : null}
                    {editable(r) ? act("trash", "מחיקה", () => remove(r), "danger") : null}
                  </div>
                </td>
              </tr>
            ))}
            {gu && pu && !filtered.length ? (
              <tr>
                <td colSpan={8} className="adm-ut-empty">אין משתמשים להצגה</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {gu === null || pu === null ? <p className="muted">טוען…</p> : null}

      {newOpen ? (
        <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="משתמש חדש" onClick={() => setNewOpen(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>משתמש חדש</h2>
            <div className="adm-ut-choose">
              {canGoogle ? (
                <button type="button" onClick={() => { setNewOpen(false); setEdit({ kind: "google", isNew: true, email: "", name: "", phone: "", roles: [], scope: {}, active: true }); }}>
                  <Icon name="mail" />
                  <strong>כניסה עם Google</strong>
                  <small>למי שיש מייל Gmail</small>
                </button>
              ) : null}
              <button type="button" onClick={() => { setNewOpen(false); setEdit({ kind: "phone", isNew: true, email: "", name: "", phone: "", roles: [], scope: {}, active: true }); }}>
                <Icon name="phone" />
                <strong>טלפון וקוד</strong>
                <small>קוד נוצר אוטומטית ונשלח בוואטסאפ</small>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {edit ? (
        <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="עריכת משתמש">
          <div className="adm-modal adm-modal--wide">
            <h2>{edit.isNew ? (edit.kind === "google" ? "משתמש Google חדש" : "משתמש טלפון חדש") : `עריכה: ${edit.name || edit.email}`}</h2>
            <div className="adm-fields adm-fields--2">
              {edit.kind === "google" ? (
                <label className="field span-2">
                  <span className="field__label">מייל Google</span>
                  <input className="input" type="email" dir="ltr" style={{ textAlign: "right" }} value={edit.email} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                </label>
              ) : null}
              <label className="field">
                <span className="field__label">שם</span>
                <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">טלפון{edit.kind === "google" ? " (לא חובה)" : ""}</span>
                <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </label>
              <fieldset className="field span-2" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="field__label" style={{ marginBottom: 6 }}>תפקידים</legend>
                <div className="adm-ut-rolepick">
                  {assignable(edit.kind).map((r) => (
                    <label key={r} className={`adm-ut-rolechip${edit.roles.includes(r) ? " is-on" : ""}`}>
                      <input type="checkbox" checked={edit.roles.includes(r)} onChange={(e) => setEdit({ ...edit, roles: e.target.checked ? [...edit.roles, r] : edit.roles.filter((x) => x !== r) })} />
                      <span>{me.roleLabels[r]}</span>
                      {ROLE_HELP[r] ? <small>{ROLE_HELP[r]}</small> : null}
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
            {msg && !msg.ok ? <div className="adm-alert adm-alert--error">{msg.text}</div> : null}
            <div className="btn-row" style={{ marginTop: 14 }}>
              <button type="button" className="btn btn--sm" disabled={!edit.roles.length || (edit.kind === "google" ? !edit.email : !edit.phone)} onClick={saveEdit}>
                <Icon name="check" /> שמירה
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shownCode ? (
        <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="קוד כניסה">
          <div className="adm-modal">
            <h2>קוד הכניסה של {shownCode.name}</h2>
            <p className="muted">הקוד מוצג עכשיו בלבד. בכניסה הראשונה יתבקש להחליף אותו.</p>
            <div className="adm-code">{shownCode.code}</div>
            <ContactActions
              phone={shownCode.phone}
              waText={`שלום ${shownCode.name}, פרטי הכניסה למערכת הניהול של טללי ברכה:\n${window.location.origin}/admin\nכניסה בטלפון וקוד - קוד: ${shownCode.code}\nבכניסה הראשונה תתבקש לבחור קוד אישי.`}
              smsText={`כניסה למערכת: ${window.location.origin}/admin קוד: ${shownCode.code}`}
            />
            <div className="btn-row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShownCode(null)}>
                סגירה
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
