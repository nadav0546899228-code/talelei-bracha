/** עזרים למבנה הארגוני: ארצי -> אזור -> עיר -> סניף */
import { useCallback, useEffect, useState } from "react";
import { Combo } from "./components";
import { api, DOMAIN_LABELS, ROLE_SCOPE, type OrgUnit, type Role, type Scope } from "./api";

export type OrgPerson = { id: string; kind: "google" | "phone"; name: string; phone: string; email: string; roles: Role[]; scope: Scope };
export type OrgData = { regions: OrgUnit[]; cities: OrgUnit[]; branches: OrgUnit[]; people: OrgPerson[] };

export function useOrg(enabled = true) {
  const [org, setOrg] = useState<OrgData | null>(null);
  const load = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return api<OrgData>("/api/org")
      .then(setOrg)
      .catch(() => setOrg({ regions: [], cities: [], branches: [], people: [] }));
  }, [enabled]);
  useEffect(() => { load(); }, [load]);
  return { org, reload: load };
}

export function scopeText(roles: Role[], scope: Scope | undefined, org: Pick<OrgData, "regions" | "cities" | "branches"> | null): string {
  if (!org) return "";
  const parts: string[] = [];
  for (const r of roles) {
    const rs = ROLE_SCOPE[r];
    if (!rs) continue;
    const s = scope?.[rs.domain] || {};
    if (rs.level === "region") {
      const reg = org.regions.find((x) => x.id === s.regionId);
      parts.push(reg ? `אזור ${reg.name}` : "לא שויך אזור");
    } else if (rs.level === "city") {
      const c = org.cities.find((x) => x.id === s.cityId);
      const reg = c ? org.regions.find((x) => x.id === c.parentId) : null;
      parts.push(c ? `עיר ${c.name}${reg ? ` (${reg.name})` : ""}` : "לא שויכה עיר");
    } else {
      const b = org.branches.find((x) => x.id === s.branchId);
      const c = b ? org.cities.find((x) => x.id === b.parentId) : null;
      const reg = c ? org.regions.find((x) => x.id === c.parentId) : null;
      parts.push(b ? `סניף ${b.name}${c ? ` (${c.name}${reg ? ` · ${reg.name}` : ""})` : ""}` : "לא שויך סניף");
    }
  }
  return parts.join(" · ");
}

export function ScopePicker({
  roles, scope, onChange, org, roleLabels,
}: {
  roles: Role[];
  scope: Scope;
  onChange: (s: Scope) => void;
  org: Pick<OrgData, "regions" | "cities" | "branches"> | null;
  roleLabels: Record<Role, string>;
}) {
  const scoped = roles.filter((r) => ROLE_SCOPE[r]);
  if (!scoped.length) return null;
  if (!org) return <p className="muted span-2">טוען מבנה ארגוני…</p>;
  return (
    <div className="span-2 adm-fields adm-fields--2">
      {scoped.map((r) => {
        const rs = ROLE_SCOPE[r]!;
        const s = scope[rs.domain] || {};
        if (rs.level === "region") {
          const regions = org.regions.filter((x) => x.domain === rs.domain);
          return <label key={r} className="field">
            <span className="field__label">אזור - {roleLabels[r]}</span>
            <select className="select" value={s.regionId || ""} onChange={(e) => onChange({ ...scope, [rs.domain]: { regionId: e.target.value || undefined } })}>
              <option value="">בחירת אזור…</option>
              {regions.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {!regions.length ? <span className="field__hint">אין עדיין אזורים ב{DOMAIN_LABELS[rs.domain]}.</span> : null}
          </label>;
        }
        if (rs.level === "city") {
          const cities = org.cities.filter((c) => c.domain === rs.domain);
          return <label key={r} className="field">
            <span className="field__label">עיר - {roleLabels[r]}</span>
            <Combo label={`עיר - ${roleLabels[r]}`} placeholder="הקלדת שם עיר…" value={s.cityId || ""} onChange={(id) => onChange({ ...scope, [rs.domain]: { cityId: id || undefined } })}
              options={cities.map((c) => ({ id: c.id, label: c.name, sub: org.regions.find((reg) => reg.id === c.parentId)?.name }))} />
          </label>;
        }
        const branches = org.branches.filter((b) => b.domain === rs.domain);
        return <label key={r} className="field">
          <span className="field__label">סניף - {roleLabels[r]}</span>
          <Combo label={`סניף - ${roleLabels[r]}`} placeholder="הקלדת עיר או סניף…" value={s.branchId || ""} onChange={(id) => onChange({ ...scope, [rs.domain]: { branchId: id || undefined } })}
            options={branches.map((b) => { const c = org.cities.find((x) => x.id === b.parentId); return { id: b.id, label: `${c?.name ?? ""} · ${b.name}`, sub: org.regions.find((reg) => reg.id === c?.parentId)?.name }; })} />
        </label>;
      })}
    </div>
  );
}
