/** לוח בקרה - קוביות לחיצות: אייקון, מספר, מילה. לחיצה נכנסת ישר לרשימה המסוננת. */
import type { ReactNode } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { displayName, FORM_LABELS, fmtDateTime, type FormKey, type View } from "../api";
import type { AdminCtx } from "../AdminApp";
import type { Alert } from "../alerts";
import type { Overview } from "./KollelView";

function Tile({ icon, n, label, tone, onClick }: { icon: IconName; n?: ReactNode; label: string; tone?: "red" | "yellow" | "teal" | "rose"; onClick: () => void }) {
  return (
    <button type="button" className={`adm-tile${tone ? ` adm-tile--${tone}` : ""}`} onClick={onClick}>
      <span className="adm-tile__icon">
        <Icon name={icon} />
      </span>
      {n !== undefined ? <span className="adm-tile__n">{n}</span> : null}
      <span className="adm-tile__l">{label}</span>
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
  const recent = list.filter((s) => s.status === "new").slice(0, 6);
  const kollel = dash.kollel;
  const openMonth = kollel?.months.find((m) => !m.locked);

  return (
    <>
      <div className="adm-head">
        <h1>
          {greet}
          {firstName ? `, ${firstName}` : ""}
        </h1>
      </div>

      {dash.active.length ? (
        <>
          <h2 className="adm-h2">
            <Icon name="alert" /> דורש טיפול
          </h2>
          <div className="adm-tiles">
            {dash.active.map((a) => (
              <Tile key={a.id} icon={a.icon} n={a.count} label={a.label} tone={a.tone} onClick={() => go(a.view, a.tab)} />
            ))}
          </div>
        </>
      ) : (
        <div className="adm-allgood">
          <Icon name="checkCircle" /> הכל מטופל
        </div>
      )}

      {views.includes("kollel") && kollel ? (
        <>
          <h2 className="adm-h2">
            <Icon name="book" /> כולל ערב
          </h2>
          <div className="adm-tiles">
            <Tile icon="users" n={kollel.avrechim.filter((a) => a.active).length} label="אברכים" tone="teal" onClick={() => go("kollel", "avrechim")} />
            <Tile icon="file" n={openMonth?.label ?? "-"} label="דיווח נסיעות" onClick={() => go("kollel", "entries")} />
            {kollel.me.canEditAvrechim ? <Tile icon="pin" n={kollel.branches.length} label="סניפים" onClick={() => go(views.includes("org") ? "org" : "kollel")} /> : null}
            {views.includes("payroll") ? <Tile icon="download" label="משכורות" onClick={() => go("payroll")} /> : null}
          </div>
        </>
      ) : null}

      {views.includes("isha") ? (
        <>
          <h2 className="adm-h2">
            <Icon name="heart" /> אישה לאישה
          </h2>
          <div className="adm-tiles">
            <Tile icon="chat" n={count("ishaRequest")} label="בקשות שיחה" tone="rose" onClick={() => go("isha", "ishaRequest")} />
            <Tile icon="hands" n={count("ishaMentor", "approved")} label="מלוות פעילות" tone="rose" onClick={() => go("isha", "ishaMentor")} />
            {views.includes("org") ? <Tile icon="pin" label="ערים וסניפים" onClick={() => go("org")} /> : null}
          </div>
        </>
      ) : null}

      {views.includes("inquiries") ? (
        <>
          <h2 className="adm-h2">
            <Icon name="inbox" /> פניות
          </h2>
          <div className="adm-tiles">
            {(["contact", "volunteer", "updates", "assistance"] as FormKey[]).map((f) => (
              <Tile
                key={f}
                icon={f === "contact" ? "mail" : f === "volunteer" ? "hands" : f === "updates" ? "sparkle" : "gift"}
                n={count(f, "new")}
                label={FORM_LABELS[f]}
                tone={count(f, "new") ? "red" : undefined}
                onClick={() => go("inquiries")}
              />
            ))}
          </div>
        </>
      ) : null}

      {recent.length ? (
        <section className="adm-panel">
          <h2>פניות חדשות</h2>
          <div className="adm-list">
            {recent.map((s) => (
              <button key={s.id} type="button" className="adm-row adm-row--tone-red" onClick={() => (s.form.startsWith("isha") ? go("isha", s.form) : go("inquiries"))}>
                <span className="adm-row__title">{displayName(s)}</span>
                <span className="adm-status adm-status--new">{FORM_LABELS[s.form]}</span>
                <span className="adm-row__sub">{fmtDateTime(s.createdAt)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <h2 className="adm-h2">
        <Icon name="sparkle" /> קיצורים
      </h2>
      <div className="adm-tiles adm-tiles--small">
        {views.includes("broadcast") ? <Tile icon="phone" label="שליחת הודעה" onClick={() => go("broadcast", "send")} /> : null}
        {views.includes("content") ? <Tile icon="edit" label="תוכן האתר" onClick={() => go("content")} /> : null}
        {views.includes("users") ? <Tile icon="users" label="משתמשים" onClick={() => go("users")} /> : null}
        {views.includes("audit") ? <Tile icon="list" label="יומן" onClick={() => go("audit")} /> : null}
        {views.includes("developer") ? <Tile icon="code" label="מתכנת" onClick={() => go("developer")} /> : null}
      </div>
    </>
  );
}
