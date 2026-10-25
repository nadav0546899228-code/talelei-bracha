/** לוח בקרה - תמונת מצב ניהולית */
import type { ReactNode } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { displayName, FORM_LABELS, fmtDateTime, type FormKey, type View } from "../api";
import type { AdminCtx } from "../AdminApp";
import type { Alert } from "../alerts";
import type { Overview } from "./KollelView";

function Tile({ icon, n, label, tone, onClick }: { icon: IconName; n?: ReactNode; label: string; tone?: "red" | "yellow" | "teal" | "rose"; onClick: () => void }) {
  return (
    <button type="button" className={`adm-tile${tone ? ` adm-tile--${tone}` : ""}`} onClick={onClick}>
      <span className="adm-tile__icon"><Icon name={icon} /></span>
      {n !== undefined ? <span className="adm-tile__n">{n}</span> : null}
      <span className="adm-tile__l">{label}</span>
    </button>
  );
}

function Metric({ icon, value, label, tone = "teal", onClick }: { icon: IconName; value: ReactNode; label: string; tone?: "teal" | "rose" | "red" | "amber"; onClick: () => void }) {
  return (
    <button type="button" className={`adm-metric adm-metric--${tone}`} onClick={onClick}>
      <span className="adm-metric__icon"><Icon name={icon} /></span>
      <span className="adm-metric__body"><strong>{value}</strong><small>{label}</small></span>
      <Icon name="arrowLeft" className="adm-metric__go" />
    </button>
  );
}

export function DashboardView({ me, subs, go, views: allViews, mode, dash }: AdminCtx & { views: View[]; dash: { active: Alert[]; kollel: Overview | null } }) {
  const views = allViews.filter((v) => (mode === "boys" ? v !== "isha" : v !== "kollel" && v !== "payroll"));
  const list = (subs ?? []).filter((s) => mode === "girls" || !s.form.startsWith("isha"));
  const count = (form: FormKey, status?: string) => list.filter((s) => s.form === form && (!status || s.status === status)).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "בוקר טוב" : hour < 17 ? "צהריים טובים" : "ערב טוב";
  const firstName = me.user.kind === "virtual" ? "" : (me.user.name || "").split(" ")[0];
  const recent = list.filter((s) => s.status === "new").slice(0, 5);
  const newTotal = list.filter((s) => s.status === "new").length;
  const attentionTotal = dash.active.reduce((n, a) => n + a.count, 0);
  const kollel = dash.kollel;
  const openMonth = kollel?.months.find((m) => !m.locked);
  const today = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="adm-dashboard">
      <section className="adm-dashboard-hero">
        <div className="adm-dashboard-hero__copy">
          <span className="adm-eyebrow">{mode === "boys" ? "קרן טללי ברכה" : "בנות צילה"}</span>
          <h1>{greet}{firstName ? `, ${firstName}` : ""}</h1>
          <p>{today}</p>
        </div>
        <div className="adm-dashboard-hero__summary">
          <div><strong>{attentionTotal}</strong><span>דורש טיפול</span></div>
          <div><strong>{newTotal}</strong><span>פניות חדשות</span></div>
        </div>
      </section>

      {dash.active.length ? (
        <section className="adm-dashboard-section">
          <div className="adm-section-title">
            <div><span className="adm-section-icon adm-section-icon--alert"><Icon name="alert" /></span><h2>דורש טיפול</h2></div>
            <span className="adm-section-count">{attentionTotal}</span>
          </div>
          <div className="adm-priority-grid">
            {dash.active.map((a) => (
              <Metric key={a.id} icon={a.icon} value={a.count} label={a.label} tone={a.tone === "red" ? "red" : "amber"} onClick={() => go(a.view, a.tab)} />
            ))}
          </div>
        </section>
      ) : (
        <div className="adm-allgood adm-allgood--premium">
          <span><Icon name="checkCircle" /></span>
          <div><strong>הכל מסודר</strong><small>אין כרגע פריטים שדורשים טיפול</small></div>
        </div>
      )}

      <section className="adm-dashboard-section">
        <div className="adm-section-title">
          <div><span className="adm-section-icon"><Icon name="grid" /></span><h2>תמונת מצב</h2></div>
        </div>
        <div className="adm-metrics">
          {views.includes("kollel") && kollel ? (
            <>
              <Metric icon="users" value={kollel.avrechim.filter((a) => a.active).length} label="אברכים פעילים" onClick={() => go("kollel", "avrechim")} />
              <Metric icon="pin" value={kollel.branches.length} label="סניפים" onClick={() => go(views.includes("org") ? "org" : "kollel")} />
              <Metric icon="calendar" value={openMonth?.label ?? "—"} label="חודש פתוח" tone="amber" onClick={() => go(views.includes("payroll") ? "payroll" : "kollel", "entries")} />
              {views.includes("payroll") ? <Metric icon="file" value="₪" label="משכורות" onClick={() => go("payroll")} /> : null}
            </>
          ) : null}
          {views.includes("isha") ? (
            <>
              <Metric icon="chat" value={count("ishaRequest", "new")} label="בקשות שיחה חדשות" tone="rose" onClick={() => go("isha", "ishaRequest")} />
              <Metric icon="hands" value={count("ishaMentor", "approved")} label="מלוות פעילות" tone="rose" onClick={() => go("isha", "ishaMentor")} />
            </>
          ) : null}
          {views.includes("inquiries") ? (
            <Metric icon="inbox" value={count("contact", "new") + count("volunteer", "new") + count("updates", "new") + count("assistance", "new")} label="פניות חדשות" tone="red" onClick={() => go("inquiries")} />
          ) : null}
        </div>
      </section>

      <div className="adm-dashboard-columns">
        <section className="adm-dashboard-section">
          <div className="adm-section-title">
            <div><span className="adm-section-icon"><Icon name="inbox" /></span><h2>פעילות אחרונה</h2></div>
          </div>
          {recent.length ? (
            <div className="adm-list adm-recent-list">
              {recent.map((s) => (
                <button key={s.id} type="button" className="adm-row" onClick={() => (s.form.startsWith("isha") ? go("isha", s.form) : go("inquiries"))}>
                  <span className="adm-row__title">{displayName(s)}</span>
                  <span className="adm-status adm-status--new">{FORM_LABELS[s.form]}</span>
                  <span className="adm-row__sub">{fmtDateTime(s.createdAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="adm-empty-state"><Icon name="checkCircle" /><strong>אין פניות חדשות</strong></div>
          )}
        </section>

        <section className="adm-dashboard-section adm-quick-section">
          <div className="adm-section-title">
            <div><span className="adm-section-icon"><Icon name="sparkle" /></span><h2>פעולות מהירות</h2></div>
          </div>
          <div className="adm-tiles adm-tiles--small">
            {views.includes("broadcast") ? <Tile icon="phone" label="שליחת הודעה" onClick={() => go("broadcast", "send")} /> : null}
            {views.includes("content") ? <Tile icon="edit" label="תוכן האתר" onClick={() => go("content")} /> : null}
            {views.includes("users") ? <Tile icon="users" label="משתמשים" onClick={() => go("users")} /> : null}
            {views.includes("reports") ? <Tile icon="grid" label="דוחות" onClick={() => go("reports")} /> : null}
            {views.includes("audit") ? <Tile icon="list" label="יומן" onClick={() => go("audit")} /> : null}
            {views.includes("developer") ? <Tile icon="code" label="מערכת" onClick={() => go("developer")} /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
