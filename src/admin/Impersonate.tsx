/** מעבר מהיר בין תצוגות (לפי תפקיד) - מנכ״ל ומתכנת. כניסה בשם אדם מסוים - ממסך המשתמשים. */
import { useEffect, useState } from "react";
import { api, post, type Domain, type OrgUnit, type Role } from "./api";

type Targets = {
  roles: { id: Role; label: string; scope: { domain: Domain; level: "region" | "city" | "branch" } | null }[];
  regions?: OrgUnit[];
  cities: OrgUnit[];
  branches: OrgUnit[];
};

const ORDER: Role[] = ["ceo", "chief_coordinator", "kollel_region", "kollel_city", "kollel_branch", "bnot_region", "bnot_city", "bnot_branch", "bnot_caller", "isha_coordinator", "office", "content_editor"];

/** טללי ברכה ובנות צילה כשני אתרים: בכל מצב רק התפקידים של אותו ארגון (+ הנהלה כללית) */
export const roleInMode = (r: string, mode: "boys" | "girls") =>
  mode === "boys" ? !(r.startsWith("bnot_") || r === "isha_coordinator") : !r.startsWith("kollel_");

/** כניסה בשם משתמש/תפקיד ורענון */
export async function enterAs(id: string) {
  try { localStorage.removeItem("tb-active-org-scope"); } catch { /* לא זמין */ }
  await post("/api/auth/impersonate", { id });
  window.location.href = "/admin";
}

export function ImpersonateModal({ onClose, onSwitched, current, onBack, backLabel = "החשבון שלי", mode }: { onClose: () => void; onSwitched: () => void; current?: string; onBack?: () => void; backLabel?: string; mode: "boys" | "girls" }) {
  const [t, setT] = useState<Targets | null>(null);
  const [open, setOpen] = useState<Role | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Targets>("/api/admin/impersonation-targets")
      .then(setT)
      .catch((e) => setErr(e.message));
  }, []);

  const go = async (id: string) => {
    try {
      try { localStorage.removeItem("tb-active-org-scope"); } catch { /* לא זמין */ }
  await post("/api/auth/impersonate", { id });
      onSwitched();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const cityName = (id: string | null) => t?.cities.find((c) => c.id === id)?.name ?? "";

  return (
    <div className="adm-vpanel" role="region" aria-label="תצוגות">
      <div className="adm-views">
        <div className="adm-vdrop__head">תצוגות · {mode === "boys" ? "טללי ברכה" : "בנות צילה"}</div>
        {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
        {onBack ? (
          <button type="button" className="adm-views__btn adm-views__btn--me" onClick={onBack}>
            {backLabel}
          </button>
        ) : null}
        {(t ? [...t.roles].filter((r) => roleInMode(r.id, mode)).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)) : []).map((r) => {
          if (!r.scope) {
            const id = `role:${r.id}`;
            return (
              <button key={r.id} type="button" className="adm-views__btn" aria-current={current === id ? "true" : undefined} onClick={() => go(id)}>
                {r.label}
              </button>
            );
          }
          const units = (r.scope.level === "region" ? t!.regions ?? [] : r.scope.level === "city" ? t!.cities : t!.branches).filter((u) => u.domain === r.scope!.domain);
          return (
            <div key={r.id}>
              <button type="button" className="adm-views__btn" aria-expanded={open === r.id} disabled={!units.length} onClick={() => setOpen(open === r.id ? null : r.id)}>
                {r.label}
                <span className="muted">{units.length ? "▾" : r.scope.level === "region" ? "אין אזורים" : r.scope.level === "city" ? "אין ערים" : "אין סניפים"}</span>
              </button>
              {open === r.id ? (
                <div className="adm-views__units">
                  {units.map((u) => {
                    const id = `role:${r.id}:${u.id}`;
                    return (
                      <button key={u.id} type="button" className="adm-chip" aria-pressed={current === id} onClick={() => go(id)}>
                        {u.name}
                        {u.type === "branch" ? ` · ${cityName(u.parentId)}` : ""}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {!t && !err ? <p className="muted">טוען…</p> : null}
      </div>
    </div>
  );
}
