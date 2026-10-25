import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, displayName, FORM_LABELS, fmtDateTime, type FormKey, type View } from "../api";
import type { Overview } from "./KollelView";
import type { AdminCtx } from "../AdminApp";

export function DashboardView({ me, subs, go, views: allViews, mode }: AdminCtx & { views: View[] }) {
  // בכל מצב רק הנתונים שלו: בנים - כולל ערב; בנות - אישה לאישה
  const views = allViews.filter((v) => (mode === "boys" ? v !== "isha" : v !== "kollel" && v !== "payroll"));
  const list = (subs ?? []).filter((s) => mode === "girls" || !s.form.startsWith("isha"));
  const count = (form: FormKey, status?: string) => list.filter((s) => s.form === form && (!status || s.status === status)).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";
  const firstName = me.user.kind === "virtual" ? "" : (me.user.name || "").split(" ")[0];

  const ishaUnassigned = list.filter((s) => s.form === "ishaRequest" && !s.assignedMentorId && !["done", "archived"].includes(s.status)).length;
  const recent = list.filter((s) => s.status === "new").slice(0, 8);
  const [kollel, setKollel] = useState<Overview | null>(null);
  useEffect(() => {
    if (views.includes("kollel")) api<Overview>("/api/kollel/overview").then(setKollel).catch(() => undefined);
  }, [views]);
  const openMonth = kollel?.months.find((m) => !m.locked);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>
            {greet}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p>תמונת מצב של מה שדורש טיפול.</p>
        </div>
      </div>

      {views.includes("kollel") && kollel ? (
        <>
          <h2>כולל ערב</h2>
          <div className="adm-stats">
            <button type="button" className="adm-stat adm-stat--teal" onClick={() => go("kollel")}>
              <div className="adm-stat__n">{kollel.avrechim.filter((a) => a.active).length}</div>
              <div className="adm-stat__l">{kollel.me.manager ? "אברכים בכולל" : kollel.me.canEditAvrechim ? "אברכים בעיר" : "אברכי הסניף"}</div>
            </button>
            <button type="button" className="adm-stat" onClick={() => go("kollel", "entries")}>
              <div className="adm-stat__n" style={{ fontSize: "1.3rem" }}>{openMonth?.label ?? "-"}</div>
              <div className="adm-stat__l">{openMonth ? "חודש פתוח לדיווח" : "אין חודש פתוח"}</div>
            </button>
            {kollel.me.canEditAvrechim ? (
              <button type="button" className="adm-stat" onClick={() => go(views.includes("org") ? "org" : "kollel")}>
                <div className="adm-stat__n">{kollel.branches.length}</div>
                <div className="adm-stat__l">{kollel.me.manager ? `סניפים ב-${kollel.cities.length} ערים` : "סניפים בעיר"}</div>
              </button>
            ) : null}
            {views.includes("payroll") ? (
              <button type="button" className="adm-stat" onClick={() => go("payroll")}>
                <Icon name="file" width={26} height={26} style={{ color: "var(--teal)" }} />
                <div className="adm-stat__l" style={{ marginTop: 6 }}>
                  משכורות החודש
                </div>
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {views.includes("isha") ? (
        <>
          <h2>אישה לאישה</h2>
          <div className="adm-stats">
            <button type="button" className="adm-stat adm-stat--rose" onClick={() => go("isha", "ishaRequest")}>
              <div className="adm-stat__n">{count("ishaRequest", "new")}</div>
              <div className="adm-stat__l">בקשות שיחה חדשות</div>
            </button>
            <button type="button" className="adm-stat adm-stat--rose" onClick={() => go("isha", "ishaRequest")}>
              <div className="adm-stat__n">{ishaUnassigned}</div>
              <div className="adm-stat__l">בקשות ללא מלווה משובצת</div>
            </button>
            <button type="button" className="adm-stat" onClick={() => go("isha", "ishaMentor")}>
              <div className="adm-stat__n">{count("ishaMentor", "new") + count("ishaMentor", "in_progress")}</div>
              <div className="adm-stat__l">מלוות ממתינות להתאמה</div>
            </button>
            <button type="button" className="adm-stat adm-stat--teal" onClick={() => go("isha", "ishaMentor")}>
              <div className="adm-stat__n">{count("ishaMentor", "approved")}</div>
              <div className="adm-stat__l">מלוות מאושרות</div>
            </button>
          </div>
        </>
      ) : null}

      {views.includes("inquiries") ? (
        <>
          <h2>פניות</h2>
          <div className="adm-stats">
            {(["contact", "volunteer", "updates", "assistance"] as FormKey[]).map((f) => (
              <button key={f} type="button" className="adm-stat" onClick={() => go("inquiries")}>
                <div className="adm-stat__n">{count(f, "new")}</div>
                <div className="adm-stat__l">{FORM_LABELS[f]} - חדשות</div>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {views.includes("isha") || views.includes("inquiries") ? (
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>פניות חדשות אחרונות</h2>
          </div>
          {subs === null ? (
            <p className="muted">טוען…</p>
          ) : recent.length ? (
            <div className="adm-list">
              {recent.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="adm-row"
                  onClick={() => (s.form.startsWith("isha") ? go("isha", s.form) : go("inquiries"))}
                >
                  <span className="adm-row__title">{displayName(s)}</span>
                  <span className="adm-status adm-status--new">{FORM_LABELS[s.form]}</span>
                  <span className="adm-row__sub">{fmtDateTime(s.createdAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="adm-empty">
              <Icon name="checkCircle" />
              אין פניות חדשות. הכול מטופל.
            </div>
          )}
        </section>
      ) : null}

      <div className="adm-stats">
        {views.includes("broadcast") ? (
          <button type="button" className="adm-stat" onClick={() => go("broadcast")}>
            <Icon name="phone" width={26} height={26} style={{ color: "var(--teal)" }} />
            <div className="adm-stat__l" style={{ marginTop: 6 }}>
              שליחת הודעה / צינתוק
            </div>
          </button>
        ) : null}
        {views.includes("content") ? (
          <button type="button" className="adm-stat" onClick={() => go("content")}>
            <Icon name="edit" width={26} height={26} style={{ color: "var(--teal)" }} />
            <div className="adm-stat__l" style={{ marginTop: 6 }}>
              עריכת תוכן האתר
            </div>
          </button>
        ) : null}
        {views.includes("users") ? (
          <button type="button" className="adm-stat" onClick={() => go("users")}>
            <Icon name="users" width={26} height={26} style={{ color: "var(--teal)" }} />
            <div className="adm-stat__l" style={{ marginTop: 6 }}>
              משתמשים והרשאות
            </div>
          </button>
        ) : null}
        {views.includes("developer") ? (
          <button type="button" className="adm-stat" onClick={() => go("developer")}>
            <Icon name="code" width={26} height={26} style={{ color: "var(--teal)" }} />
            <div className="adm-stat__l" style={{ marginTop: 6 }}>
              מצב מערכת וחיבורים
            </div>
          </button>
        ) : null}
      </div>
    </>
  );
}
