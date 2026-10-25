/** ערים, סניפים ורכזים - בשני התחומים: כולל ערב ובנות צילה */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, DOMAIN_LABELS, post, type Domain, type Me, type OrgUnit } from "../api";
import type { Avrech } from "../kollelCalc";
import { useOrg, type OrgPerson } from "../org";
import { PhoneUsersPanel } from "./PhoneUsersPanel";
import { Fab, IconActions } from "../components";
import { useLive } from "../live";

export function OrgView({ me, domain }: { me: Me; domain: Domain }) {
  const { org, reload } = useOrg();
  useLive(["orgUnits", "users", "phoneUsers"], reload);
  const roles = me.user.roles;
  const seesAll = roles.includes("developer") || roles.includes("ceo") || roles.includes("chief_coordinator");
  const [avrechim, setAvrechim] = useState<Avrech[]>([]);
  const [edit, setEdit] = useState<{ id?: string; type: "city" | "branch"; name: string; parentId: string | null } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (me.user.views.includes("kollel")) api<{ avrechim: Avrech[] }>("/api/kollel/overview").then((r) => setAvrechim(r.avrechim)).catch(() => undefined);
  }, [me.user.views]);

  const cities = useMemo(() => (org?.cities ?? []).filter((c) => c.domain === domain), [org, domain]);
  const branches = useMemo(() => (org?.branches ?? []).filter((b) => b.domain === domain), [org, domain]);
  const people = org?.people ?? [];
  const cityPeople = (id: string) => people.filter((p) => p.roles.includes(`${domain}_city` as never) && p.scope?.[domain]?.cityId === id);
  const branchPeople = (id: string) => people.filter((p) => p.roles.includes(`${domain}_branch` as never) && p.scope?.[domain]?.branchId === id);
  const chiefs = people.filter((p) => p.roles.includes("chief_coordinator"));

  const save = async () => {
    if (!edit) return;
    setMsg(null);
    try {
      await post("/api/org/units", { ...edit, domain });
      setEdit(null);
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };
  const remove = async (u: OrgUnit) => {
    if (!window.confirm(`למחוק את ${u.type === "city" ? "העיר" : "הסניף"} ${u.name}?`)) return;
    try {
      await del(`/api/org/units/${u.id}`);
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };

  const who = (list: OrgPerson[], empty: string) =>
    list.length ? (
      list.map((p) => (
        <span key={p.id} className="adm-person">
          {p.name || p.email}
          {p.phone ? (
            <a href={`tel:${p.phone}`} dir="ltr" className="muted">
              {" "}
              {p.phone}
            </a>
          ) : null}
        </span>
      ))
    ) : (
      <span className="adm-missing">{empty}</span>
    );

  if (!org) return <p className="muted">טוען…</p>;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{domain === "bnot" ? "ערים, סניפים ורכזות" : "ערים, סניפים ורכזים"}</h1>
          <p>
            {DOMAIN_LABELS[domain]} · {seesAll ? "מנכ״ל ← רכז ראשי ← רכזי ערים ← מנהלי סניפים." : "העיר שלך, הסניפים שבה ומנהלי הסניפים."}
          </p>
        </div>
      </div>


      {seesAll ? (
        <section className="adm-panel">
          <h2 style={{ marginBottom: 6 }}>רכז ראשי</h2>
          <div className="adm-people">{who(chiefs, "עדיין לא הוגדר רכז ראשי")}</div>
        </section>
      ) : null}

      <div className="adm-toolbar">
        {seesAll ? (
          <button type="button" className="btn btn--sm" onClick={() => setEdit({ type: "city", name: "", parentId: null })}>
            <Icon name="plus" /> עיר
          </button>
        ) : null}
      </div>

      {edit ? (
        <section className="adm-panel">
          <h2>{edit.id ? "עריכה" : edit.type === "city" ? `עיר חדשה - ${DOMAIN_LABELS[domain]}` : `סניף חדש - ${DOMAIN_LABELS[domain]}`}</h2>
          <div className="adm-fields adm-fields--2">
            <label className="field">
              <span className="field__label">{edit.type === "city" ? "שם העיר" : "שם הסניף"}</span>
              <input className="input" value={edit.name} autoFocus onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            {edit.type === "branch" ? (
              <label className="field">
                <span className="field__label">עיר</span>
                <select className="select" value={edit.parentId ?? ""} onChange={(e) => setEdit({ ...edit, parentId: e.target.value })}>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--sm" disabled={!edit.name.trim()} onClick={save}>
              שמירה
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}
      {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`} style={{ marginBottom: 12 }}>{msg.text}</div> : null}

      {cities.map((c) => {
        const bs = branches.filter((b) => b.parentId === c.id);
        return (
          <section key={c.id} className="adm-panel adm-city">
            <div className="adm-panel__head">
              <h2>
                {c.name} <span className="muted">({bs.length} סניפים)</span>
              </h2>
              {seesAll ? (
                <span className="adm-item__actions">
                  <button type="button" className="adm-icon-btn" aria-label={`עריכת ${c.name}`} onClick={() => setEdit({ id: c.id, type: "city", name: c.name, parentId: null })}>
                    <Icon name="edit" />
                  </button>
                  <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label={`מחיקת ${c.name}`} onClick={() => remove(c)}>
                    <Icon name="trash" />
                  </button>
                </span>
              ) : null}
            </div>
            <div className="adm-people">
              <strong>{domain === "bnot" ? "רכזת העיר:" : "רכז העיר:"}</strong> {who(cityPeople(c.id), "לא הוגדר")}
            </div>
            <div className="adm-list" style={{ marginTop: 10 }}>
              {bs.map((b) => {
                const mgrs = branchPeople(b.id);
                const count = avrechim.filter((a) => a.active && a.branchId === b.id).length;
                return (
                  <div key={b.id} className={`adm-row adm-row--tone-${mgrs.length ? "green" : "yellow"}`} style={{ cursor: "default" }}>
                    <span className="adm-row__title">סניף {b.name}</span>
                    <span className="adm-item__actions">
                      {mgrs[0]?.phone ? <IconActions phone={mgrs[0].phone} waText={`שלום ${mgrs[0].name}, `} /> : null}
                      <button type="button" className="adm-icon-btn" aria-label={`עריכת ${b.name}`} onClick={() => setEdit({ id: b.id, type: "branch", name: b.name, parentId: b.parentId })}>
                        <Icon name="edit" />
                      </button>
                      {seesAll ? (
                        <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label={`מחיקת ${b.name}`} onClick={() => remove(b)}>
                          <Icon name="trash" />
                        </button>
                      ) : null}
                    </span>
                    <span className="adm-row__sub">
                      {domain === "bnot" ? "מנהלת: " : "מנהל: "}
                      {mgrs.length ? mgrs.map((p) => p.name).join(", ") : "לא הוגדר"}
                      {domain === "kollel" ? ` · ${count} אברכים` : ""}
                    </span>
                  </div>
                );
              })}
              {!bs.length ? <p className="muted">אין עדיין סניפים בעיר.</p> : null}
            </div>
          </section>
        );
      })}
      {!cities.length ? (
        <div className="adm-panel adm-empty">
          {seesAll ? `אין עדיין ערים ב${DOMAIN_LABELS[domain]}. מתחילים בהוספת עיר, ואז סניפים.` : "לא שויכה לך עיר. יש לפנות לרכז הראשי."}
        </div>
      ) : null}

      {cities.length && !edit ? <Fab label="הוספת סניף" onClick={() => setEdit({ type: "branch", name: "", parentId: cities[0]?.id ?? null })} /> : null}
      <div style={{ marginTop: 20 }}>
        <PhoneUsersPanel me={me} org={org} onChange={reload} title="רכזים ומנהלי סניפים (כניסה בטלפון וקוד)" />
      </div>
      {me.user.views.includes("users") ? (
        <p className="muted">רכזים עם חשבון Google מוסיפים במסך "משתמשים והרשאות", עם אותה בחירת עיר וסניף.</p>
      ) : null}
    </>
  );
}
