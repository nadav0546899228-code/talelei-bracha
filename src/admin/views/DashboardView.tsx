/** לוח בקרה - תמונת מצב ניהולית */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../../components/Icon";
import { api, displayName, FORM_LABELS, fmtDateTime, type FormKey, type View } from "../api";
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

type BnotOverview = {
  members: { id: string; active: boolean }[];
  activities: { id: string; date: string; present: string[] }[];
};
type MitchOverview = {
  mitch: { id: string; status: string; nextFollowUp: string | null }[];
  today: string;
};

function TrendBars({ values, labels, tone = "teal" }: { values: number[]; labels: string[]; tone?: "teal" | "rose" }) {
  const max = Math.max(1, ...values);
  return (
    <div className={`adm-trend adm-trend--${tone}`} aria-label="מגמת שבעה ימים">
      {values.map((v, i) => (
        <div className="adm-trend__col" key={labels[i]}>
          <div className="adm-trend__barbox"><span style={{ height: `${Math.max(8, Math.round((v / max) * 100))}%` }} /></div>
          <strong>{v}</strong>
          <small>{labels[i]}</small>
        </div>
      ))}
    </div>
  );
}

function lastSeven(rows: { createdAt: string }[]) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  return {
    values: days.map((d) => rows.filter((r) => {
      const x = new Date(r.createdAt);
      return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
    }).length),
    labels: days.map((d) => new Intl.DateTimeFormat("he-IL", { weekday: "short" }).format(d)),
  };
}

export function DashboardView({ me, subs, go, views: allViews, mode, dash }: AdminCtx & { views: View[]; dash: { active: Alert[]; kollel: Overview | null } }) {
  const views = allViews.filter((v) => (mode === "boys" ? v !== "isha" : v !== "kollel" && v !== "payroll"));
  const [bnot, setBnot] = useState<BnotOverview | null>(null);
  const [mitch, setMitch] = useState<MitchOverview | null>(null);
  const viewKey = allViews.join(",");

  useEffect(() => {
    let alive = true;
    if (mode === "girls" && allViews.includes("bnot")) {
      api<BnotOverview>("/api/bnot/overview").then((x) => alive && setBnot(x)).catch(() => alive && setBnot(null));
    } else setBnot(null);
    const domain = mode === "girls" ? "bnot" : "kollel";
    if (allViews.includes(domain === "bnot" ? "bnot" : "kollel")) {
      api<MitchOverview>(`/api/mitch?domain=${domain}`).then((x) => alive && setMitch(x)).catch(() => alive && setMitch(null));
    } else setMitch(null);
    return () => { alive = false; };
  }, [mode, viewKey]);
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

  const ishaRequests = list.filter((s) => s.form === "ishaRequest");
  const approvedMentors = list.filter((s) => s.form === "ishaMentor" && s.status === "approved");
  const openIsha = ishaRequests.filter((s) => !["done", "archived"].includes(s.status));
  const unassignedIsha = openIsha.filter((s) => !s.assignedMentorId);
  const assignedIsha = openIsha.filter((s) => s.assignedMentorId);
  const mentorLoads = approvedMentors.map((mentor) => ({
    id: mentor.id,
    name: displayName(mentor),
    load: openIsha.filter((r) => r.assignedMentorId === mentor.id).length,
  })).sort((a, b) => b.load - a.load);
  const availableMentors = mentorLoads.filter((x) => x.load < 3).length;
  const trend = useMemo(() => lastSeven(list), [list]);
  const activeMembers = bnot?.members.filter((m) => m.active).length ?? 0;
  const recentActivities = bnot?.activities.filter((a) => {
    const d = new Date(`${a.date}T12:00:00`);
    return Date.now() - d.getTime() <= 7 * 86400_000;
  }).length ?? 0;
  const activeMitch = mitch?.mitch.filter((x) => x.status === "active").length ?? 0;
  const dueMitch = mitch?.mitch.filter((x) => x.status === "active" && x.nextFollowUp && x.nextFollowUp <= (mitch?.today || "")).length ?? 0;

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

      <section className="adm-command-center">
        <div className="adm-command-center__head">
          <div>
            <span className="adm-eyebrow">מרכז שליטה</span>
            <h2>מה קורה עכשיו</h2>
          </div>
          <span className="adm-command-center__live"><i /> מתעדכן מהמערכת</span>
        </div>

        <div className="adm-command-grid">
          {mode === "girls" && views.includes("isha") ? (
            <>
              <button type="button" className={`adm-command-card${unassignedIsha.length ? " is-urgent" : ""}`} onClick={() => go("isha", "ishaRequest")}>
                <span><Icon name="chat" /></span>
                <strong>{unassignedIsha.length}</strong>
                <small>בקשות ללא מלווה</small>
                <em>{unassignedIsha.length ? "דורש שיבוץ" : "הכול משובץ"}</em>
              </button>
              <button type="button" className="adm-command-card" onClick={() => go("isha", "ishaMentor")}>
                <span><Icon name="hands" /></span>
                <strong>{availableMentors}</strong>
                <small>מלוות עם עומס נמוך</small>
                <em>{approvedMentors.length} מאושרות בסך הכול</em>
              </button>
            </>
          ) : null}

          {mode === "girls" && views.includes("bnot") ? (
            <>
              <button type="button" className="adm-command-card" onClick={() => go("bnot", "members")}>
                <span><Icon name="users" /></span>
                <strong>{activeMembers}</strong>
                <small>משתתפות פעילות</small>
                <em>{recentActivities} פעילויות ב־7 ימים</em>
              </button>
              <button type="button" className={`adm-command-card${dueMitch ? " is-warn" : ""}`} onClick={() => go("bnot", "mitch")}>
                <span><Icon name="heart" /></span>
                <strong>{dueMitch}</strong>
                <small>מתחזקות למעקב היום</small>
                <em>{activeMitch} פעילות במעקב</em>
              </button>
            </>
          ) : null}

          {mode === "boys" && views.includes("kollel") ? (
            <>
              <button type="button" className="adm-command-card" onClick={() => go("kollel", "avrechim")}>
                <span><Icon name="users" /></span>
                <strong>{kollel?.avrechim.filter((a) => a.active).length ?? 0}</strong>
                <small>אברכים פעילים</small>
                <em>{kollel?.branches.length ?? 0} סניפים</em>
              </button>
              <button type="button" className={`adm-command-card${dueMitch ? " is-warn" : ""}`} onClick={() => go("kollel", "mitch")}>
                <span><Icon name="heart" /></span>
                <strong>{dueMitch}</strong>
                <small>מתחזקים למעקב היום</small>
                <em>{activeMitch} פעילים במעקב</em>
              </button>
            </>
          ) : null}
        </div>

        <div className="adm-command-lower">
          <div className="adm-command-chart">
            <div className="adm-command-chart__head">
              <div><strong>פעילות שנכנסה למערכת</strong><small>7 הימים האחרונים</small></div>
              <strong>{trend.values.reduce((a, b) => a + b, 0)}</strong>
            </div>
            <TrendBars values={trend.values} labels={trend.labels} tone={mode === "girls" ? "rose" : "teal"} />
          </div>

          {mode === "girls" && views.includes("isha") ? (
            <div className="adm-workload">
              <div className="adm-command-chart__head"><div><strong>עומס מלוות</strong><small>שיבוצים פעילים</small></div><strong>{assignedIsha.length}</strong></div>
              {mentorLoads.length ? mentorLoads.slice(0, 5).map((m) => {
                const maxLoad = Math.max(1, ...mentorLoads.map((x) => x.load));
                return (
                  <button key={m.id} type="button" className="adm-workload__row" onClick={() => go("isha", "ishaMentor")}>
                    <span>{m.name}</span>
                    <i><b style={{ width: `${Math.max(6, (m.load / maxLoad) * 100)}%` }} /></i>
                    <strong>{m.load}</strong>
                  </button>
                );
              }) : <div className="adm-empty">עדיין אין מלוות מאושרות.</div>}
            </div>
          ) : (
            <div className="adm-next-action">
              <Icon name={attentionTotal ? "alert" : "checkCircle"} />
              <div><strong>{attentionTotal ? "יש דברים שמחכים לך" : "אין צוואר בקבוק כרגע"}</strong><small>{attentionTotal ? `${attentionTotal} פריטים דורשים טיפול` : "המערכת לא מזהה כרגע עומס חריג"}</small></div>
            </div>
          )}
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
