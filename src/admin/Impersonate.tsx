/** מעבר מהיר בין תצוגות (לפי תפקיד) - מנכ״ל ומתכנת. כניסה בשם אדם מסוים - ממסך המשתמשים. */
import { useEffect, useState } from "react";
import { api, post, type Domain, type OrgUnit, type Role } from "./api";

type Targets = {
  roles: { id: Role; label: string; scope: { domain: Domain; level: "city" | "branch" } | null }[];
  cities: OrgUnit[];
  branches: OrgUnit[];
};

const ORDER: Role[] = ["ceo", "chief_coordinator", "kollel_city", "kollel_branch", "bnot_city", "bnot_branch", "isha_coordinator", "office", "content_editor"];

/** כניסה בשם משתמש/תפקיד ורענון */
export async function enterAs(id: string) {
  await post("/api/auth/impersonate", { id });
  window.location.href = "/admin";
}

export function ImpersonateModal({ onClose, onSwitched, current, onBack, backLabel = "החשבון שלי" }: { onClose: () => void; onSwitched: () => void; current?: string; onBack?: () => void; backLabel?: string }) {
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
      await post("/api/auth/impersonate", { id });
      onSwitched();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };

  const cityName = (id: string | null) => t?.cities.find((c) => c.id === id)?.name ?? "";

  return (
    <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="תצוגות" onClick={onClose}>
      <div className="adm-modal adm-views" onClick={(e) => e.stopPropagation()}>
        <div className="adm-panel__head">
          <h2>תצוגות</h2>
          <button type="button" className="adm-icon-btn" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
        {onBack ? (
          <button type="button" className="adm-views__btn adm-views__btn--me" onClick={onBack}>
            {backLabel}
          </button>
        ) : null}
        {(t ? [...t.roles].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)) : []).map((r) => {
          if (!r.scope) {
            const id = `role:${r.id}`;
            return (
              <button key={r.id} type="button" className="adm-views__btn" aria-current={current === id ? "true" : undefined} onClick={() => go(id)}>
                {r.label}
              </button>
            );
          }
          const units = (r.scope.level === "city" ? t!.cities : t!.branches).filter((u) => u.domain === r.scope!.domain);
          return (
            <div key={r.id}>
              <button type="button" className="adm-views__btn" aria-expanded={open === r.id} disabled={!units.length} onClick={() => setOpen(open === r.id ? null : r.id)}>
                {r.label}
                <span className="muted">{units.length ? "▾" : r.scope.level === "city" ? "אין ערים" : "אין סניפים"}</span>
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
