import { EventCard, LessonCard } from "../components/Content";
import { UpdatesForm } from "../components/forms/Forms";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Flag, PageHero, Placeholder, SectionHead } from "../components/ui";
import { site } from "../config/site";
import { events, lessons } from "../data/content";
import { Link } from "../router/Router";

export default function BnotTzila() {
  const bzLessons = lessons.filter((l) => l.brand === "bz").slice(0, 3);
  const bzEvents = events
    .filter((e) => e.brand === "bz" && new Date(e.start).getTime() >= Date.now())
    .slice(0, 2);

  return (
    <>
      <PageHero
        bz
        title={site.orgs.bnotTzila.name}
        lead={site.orgs.bnotTzila.tagline ?? "שיעורים, ערבי נשים, כנסים, תכני חיזוק ומיזם אישה לאישה."}
        crumbs={[{ label: site.orgs.bnotTzila.name }]}
        aside={<Logo org="bnotTzila" height={180} priority />}
      >
        <nav className="anchor-nav" aria-label="ניווט בעמוד">
          <a href="#who">מי אנחנו</a>
          <a href="#activity">פעילויות</a>
          <a href="#content">תכני חיזוק</a>
          <a href="#events">אירועים</a>
          <a href="#updates">עדכונים</a>
        </nav>
      </PageHero>

      <section className="section" id="who">
        <div className="container split">
          <div>
            <SectionHead eyebrow="מי אנחנו" title="מטרת הפעילות" rose />
            {site.about.bnotTzila ? (
              <p style={{ fontSize: "1.12rem" }}>{site.about.bnotTzila}</p>
            ) : (
              <Placeholder title="מי אנחנו / מטרת בנות צילה - נוסח מאושר" todo="site.about.bnotTzila" />
            )}
          </div>
          <Link to="/isha-le-isha" className="card card--link card--bz" style={{ background: "linear-gradient(180deg,#fff,var(--blush))" }}>
            <span className="card__icon">
              <Icon name="chat" />
            </span>
            <div className="eyebrow eyebrow--rose">מיזם מיוחד</div>
            <h3>אישה לאישה</h3>
            <p className="muted">שיחות אישיות ודיסקרטיות לנשים שעברו תהליך חיזוק - ואפשרות להצטרף כמלווה.</p>
            <span className="text-link">
              לפרטים ולבקשת שיחה <Icon name="arrowLeft" />
            </span>
          </Link>
        </div>
      </section>

      <section className="section section--blush" id="activity">
        <div className="container">
          <SectionHead eyebrow="פעילויות" title="שיעורים, ערבי נשים וכנסים" rose />
          <div className="grid grid--3">
            {[
              { t: "שיעורים", i: "book" as const },
              { t: "ערבי נשים", i: "users" as const },
              { t: "כנסים ופעילויות", i: "sparkle" as const },
            ].map((x) => (
              <article key={x.t} className="card card--bz">
                <span className="card__icon">
                  <Icon name={x.i} />
                </span>
                <h3>{x.t}</h3>
                <Placeholder inline title="פירוט יוזן לאחר אישור" />
              </article>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 14 }}>
            סוגי הפעילות לפי מסמך האפיון. <Flag />
          </p>
        </div>
      </section>

      <section className="section" id="content">
        <div className="container">
          <SectionHead eyebrow="תכני חיזוק" title="הקלטות ותכנים לנשים" rose />
          <div className="grid grid--3">
            {bzLessons.map((l) => (
              <LessonCard key={l.id} l={l} />
            ))}
          </div>
          <p style={{ marginTop: 20 }}>
            <Link to="/lessons" className="btn btn--ghost-rose">
              לכל התכנים
            </Link>
          </p>
        </div>
      </section>

      <section className="section section--white" id="events">
        <div className="container">
          <SectionHead eyebrow="אירועים" title="אירועים קרובים" rose />
          {bzEvents.length ? (
            <div className="grid grid--2">
              {bzEvents.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <Placeholder title="אירועים חדשים יפורסמו כאן" />
          )}
        </div>
      </section>

      <section className="section" id="updates">
        <div className="container split">
          <div>
            <SectionHead eyebrow="נשארות בקשר" title="קבלת עדכונים, הצטרפות והתנדבות" rose>
              <p>רוצה לשמוע על שיעורים ואירועים, או לקחת חלק בפעילות? השאירי פרטים.</p>
            </SectionHead>
            <div className="btn-row">
              <Link to="/join" className="btn btn--ghost-rose">
                להתנדבות
              </Link>
              <Link to="/isha-le-isha#mentor" className="btn btn--ghost">
                להצטרפות כמלווה
              </Link>
            </div>
          </div>
          <div className="form-card form-card--bz">
            <UpdatesForm />
          </div>
        </div>
      </section>
    </>
  );
}
