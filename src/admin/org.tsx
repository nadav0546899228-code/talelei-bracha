/** עזרים למבנה הארגוני: ערים, סניפים ושיוך רכזים */
import { useCallback, useEffect, useState } from "react";
import { api, DOMAIN_LABELS, ROLE_SCOPE, type OrgUnit, type Role, type Scope } from "./api";

export type OrgPerson = { id: string; kind: "google" | "phone"; name: string; phone: string; email: string; roles: Role[]; scope: Scope };
export type OrgData = { cities: OrgUnit[]; branches: OrgUnit[]; people: OrgPerson[] };

export function useOrg(enabled = true) {
  const [org, setOrg] = useState<OrgData | null>(null);
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return api<OrgData>("/api/org")
      .then(setOrg)
      .catch(() => setOrg({ cities: [], branches: [], people: [] }));
  }, [enabled]);
  useEffect(() => {
    load();
  }, [load]);
  return { org, reload: load };
}

/** טקסט קצר: "רכז עיר - כולל ערב: בני ברק" */
export function scopeText(roles: Role[], scope: Scope | undefined, org: Pick<OrgData, "cities" | "branches"> | null): string {
  if (!org) return "";
  const parts: string[] = [];
  for (const r of roles) {
    const rs = ROLE_SCOPE[r];
    if (!rs) continue;
    const s = scope?.[rs.domain] || {};
    if (rs.level === "city") {
      const c = org.cities.find((x) => x.id === s.cityId);
      parts.push(c ? `עיר ${c.name}` : "לא שויכה עיר");
    } else {
      const b = org.branches.find((x) => x.id === s.branchId);
      const c = b ? org.cities.find((x) => x.id === b.parentId) : null;
      parts.push(b ? `סניף ${b.name}${c ? ` (${c.name})` : ""}` : "לא שויך סניף");
    }
  }
  return parts.join(" · ");
}

/** בחירת עיר/סניף לכל תפקיד משויך שנבחר */
export function ScopePicker({
  roles,
  scope,
  onChange,
  org,
  roleLabels,
}: {
  roles: Role[];
  scope: Scope;
  onChange: (s: Scope) => void;
  org: Pick<OrgData, "cities" | "branches"> | null;
  roleLabels: Record<Role, string>;
}) {
  const scoped = roles.filter((r) => ROLE_SCOPE[r]);
  if (!scoped.length) return null;
  if (!org) return <p className="muted span-2">טוען ערים וסניפים…</p>;
  return (
    <div className="span-2 adm-fields adm-fields--2">
      {scoped.map((r) => {
        const rs = ROLE_SCOPE[r]!;
        const s = scope[rs.domain] || {};
        if (rs.level === "city") {
          const cities = org.cities.filter((c) => c.domain === rs.domain);
          return (
            <label key={r} className="field">
              <span className="field__label">עיר - {roleLabels[r]}</span>
              <select className="select" value={s.cityId || ""} onChange={(e) => onChange({ ...scope, [rs.domain]: { ...s, cityId: e.target.value || undefined } })}>
                <option value="">בחירת עיר…</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!cities.length ? <span className="field__hint">אין עדיין ערים ב{DOMAIN_LABELS[rs.domain]}. מוסיפים במסך "ערים, סניפים ורכזים".</span> : null}
            </label>
          );
        }
        const branches = org.branches.filter((b) => b.domain === rs.domain);
        return (
          <label key={r} className="field">
            <span className="field__label">סניף - {roleLabels[r]}</span>
            <select className="select" value={s.branchId || ""} onChange={(e) => onChange({ ...scope, [rs.domain]: { ...s, branchId: e.target.value || undefined } })}>
              <option value="">בחירת סניף…</option>
              {org.cities
                .filter((c) => c.domain === rs.domain)
                .map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {branches
                      .filter((b) => b.parentId === c.id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
            {!branches.length ? <span className="field__hint">אין עדיין סניפים ב{DOMAIN_LABELS[rs.domain]}. מוסיפים במסך "ערים, סניפים ורכזים".</span> : null}
          </label>
        );
      })}
    </div>
  );
}
