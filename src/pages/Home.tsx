import { ActivityCard, EventCard, LessonCard } from "../components/Content";
import { ContactForm } from "../components/forms/Forms";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { ContactDetails } from "../components/ContactDetails";
import { DonateLink, Flag, Placeholder, Reveal, SectionHead } from "../components/ui";
import { donation } from "../config/integrations";
import { site } from "../config/site";
import { activities, events, lessons } from "../data/content";
import { Link } from "../router/Router";

export default function Home() {
  const upcoming = events
    .filter((e) => new Date(e.start).getTime() >= Date.now())
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3);
  const latest = lessons.slice(0, 3);
  const flags = site.features.showContentFlags;

  return (
    <>
      {/* ---------- פתיח ---------- */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero__grid">
          <div>
            <div className="hero__logos">
              <span className="logo-card">
                <Logo org="taleiBracha" height={128} priority className="logo--tb-hero" />
              </span>
              <span className="hero__logos-plus" aria-hidden="true">
                +
              </span>
              <span className="logo-card">
                <Logo org="bnotTzila" height={100} priority className="logo--bz-hero" />
              </span>
            </div>
            <h1 id="hero-title">
              תורה, חסד וחיזוק
              <br />
              <span className="accent-tb">קרן טללי ברכה</span> ו<span className="accent-bz">בנות צילה</span>
            </h1>
            {site.vision ? (
              <p className="hero__lead">{site.vision}</p>
            ) : (
              <p className="hero__lead">
                רשת כוללים בארץ ישראל, ופעילות נשים של בנות צילה - שיעורים, חסד, ליווי וחיזוק. <Flag />
              </p>
            )}
            <div className="btn-row">
              <a href="#activities" className="btn btn--ink">
                הכירו את הפעילות
              </a>
              <Link to="/bnot-tzila" className="btn btn--ghost-rose">
                בנות צילה
              </Link>
              <Link to="/donate" className="btn btn--flame">
                <Icon name="heart" />
                לתרומה
              </Link>
            </div>
          </div>

          <div className="hero__media-wrap">
            <div className="hero__media">
              <div className="hero__media-inner">
                <div>
                  <Icon name="image" width={42} height={42} style={{ margin: "0 auto 12px", color: "var(--teal-logo)" }} />
                  <strong style={{ color: "var(--ink)", display: "block" }}>תמונה או וידאו אותנטיים מהפעילות</strong>
                  <span className="muted" style={{ fontSize: "0.95rem" }}>
                    יוזנו לאחר קבלת חומר מאושר לפרסום
                  </span>
                </div>
              </div>
            </div>
            <Link to="/isha-le-isha" className="hero__badge" style={{ textDecoration: "none" }}>
              <span className="hero__badge-dot">
                <Icon name="chat" />
              </span>
              <span>
                אישה לאישה
                <small>שיחה אישית, דיסקרטית ולא שיפוטית</small>
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- מי אנחנו ---------- */}
      <section className="section section--white" aria-labelledby="who-title">
        <div className="container">
          <SectionHead eyebrow="מי אנחנו" title="שני מוסדות, משפחה אחת" id="who-title" center>
            <p>
              קרן טללי ברכה היא המסגרת הראשית, ובנות צילה פועלת בתוכה עם פעילות ייעודית לנשים. <Flag />
            </p>
          </SectionHead>
          <div className="grid grid--2">
            <Reveal>
              <article className="card" style={{ height: "100%" }}>
                <div style={{ marginBottom: 16 }}>
                  <Logo org="taleiBracha" height={96} />
                </div>
                <h3>{site.orgs.taleiBracha.name}</h3>
                <p className="muted">{site.orgs.taleiBracha.tagline}</p>
                {site.about.taleiBracha ? (
                  <p>{site.about.taleiBracha}</p>
                ) : (
                  <Placeholder title="תיאור קצר ומאושר של הקרן" todo="site.about.taleiBracha" />
                )}
                <p style={{ marginTop: 16 }}>
                  <Link to="/keren-talelei-bracha" className="text-link">
                    לעמוד הקרן <Icon name="arrowLeft" />
                  </Link>
                </p>
              </article>
            </Reveal>
            <Reveal delay={80}>
              <article className="card card--bz" style={{ height: "100%" }}>
                <div style={{ marginBottom: 16 }}>
                  <Logo org="bnotTzila" height={80} />
                </div>
                <h3>{site.orgs.bnotTzila.name}</h3>
                <p className="muted">פעילות נשים, שיעורים וחיזוק</p>
                {site.about.bnotTzila ? (
                  <p>{site.about.bnotTzila}</p>
                ) : (
                  <Placeholder title="תיאור קצר ומאושר של בנות צילה" todo="site.about.bnotTzila" />
                )}
                <p style={{ marginTop: 16 }}>
                  <Link to="/bnot-tzila" className="text-link" style={{ color: "var(--rose-strong)" }}>
                    לעמוד בנות צילה <Icon name="arrowLeft" />
                  </Link>
                </p>
              </article>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- תחומי פעילות ---------- */}
      <section className="section" id="activities" aria-labelledby="act-title">
        <div className="container">
          <SectionHead eyebrow="תחומי הפעילות" title="במה אנחנו עוסקים" id="act-title">
            <p>תורה, חסד, פעילות נשים, ליווי וחיזוק - וכל הדרכים להשתתף.</p>
          </SectionHead>
          <div className="grid grid--3">
            {activities.map((a, i) => (
              <Reveal key={a.id} delay={i * 60}>
                <ActivityCard a={a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- בנות צילה ---------- */}
      <section className="section section--tight" aria-labelledby="bz-title">
        <div className="container">
          <Reveal>
            <div className="bz-feature">
              <span className="bz-feature__curve" aria-hidden="true" />
              <div className="bz-feature__logo">
                <Logo org="bnotTzila" height={186} />
              </div>
              <div>
                <div className="eyebrow eyebrow--rose">בנות צילה</div>
                <h2 id="bz-title">מקום חם לנשים - ללמוד, להתחזק ולהתחבר</h2>
                <p className="muted">
                  שיעורים, ערבי נשים, כנסים ותכני חיזוק, ומיזם הליווי האישי "אישה לאישה". <Flag />
                </p>
                <div className="btn-row">
                  <Link to="/bnot-tzila" className="btn btn--rose">
                    לעמוד בנות צילה
                  </Link>
                  <Link to="/isha-le-isha" className="btn btn--ghost-rose">
                    מיזם אישה לאישה
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- אישה לאישה ---------- */}
      <section className="section" aria-labelledby="isha-title">
        <div className="container">
          <div className="isha-panel">
            <SectionHead eyebrow='מיזם "אישה לאישה"' title="יש עם מי לדבר" id="isha-title" rose>
              <p>
                שיחות אישיות לנשים שעברו תהליך חיזוק, עם נשים מתאימות - ובפרט נשות אברכים מקרן טללי ברכה. בדיסקרטיות, בחום ובלי שיפוטיות.
              </p>
            </SectionHead>
            <div className="isha-paths">
              <Link to="/isha-le-isha#request" className="path-card">
                <span className="path-card__num">א</span>
                <h3>אני רוצה שיחת חיזוק</h3>
                <p>טופס קצר - שם או כינוי, דרך חזרה וזמן נוח. בלי לספר סיפור באתר.</p>
                <span className="btn btn--rose btn--sm">לבקשת שיחה</span>
              </Link>
              <Link to="/isha-le-isha#mentor" className="path-card path-card--mentor">
                <span className="path-card__num">ב</span>
                <h3>אני רוצה להיות מלווה</h3>
                <p>לנשות אברכים ולנשים מתאימות שרוצות לתת מכוחן. ההצטרפות בכפוף לשיחת התאמה.</p>
                <span className="btn btn--sm">להצטרפות כמלווה</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- מהשטח ---------- */}
      <section className="section section--white" aria-labelledby="field-title">
        <div className="container">
          <SectionHead eyebrow="מהשטח" title="פעילות ועדכונים" id="field-title">
            <p>תמונות אמיתיות ועדכונים מהפעילות - רק חומר שאושר לפרסום.</p>
          </SectionHead>
          <div className="grid grid--3">
            {[1, 2, 3].map((n) => (
              <Placeholder key={n} media title="תמונה ועדכון מהפעילות" todo="field-updates">
                יוזנו לאחר אישור פרסום
              </Placeholder>
            ))}
          </div>
          <p style={{ marginTop: 20 }}>
            <Link to="/gallery" className="text-link">
              לגלריה המלאה <Icon name="arrowLeft" />
            </Link>
          </p>
        </div>
      </section>

      {/* ---------- שיעורים ---------- */}
      <section className="section" aria-labelledby="lessons-title">
        <div className="container">
          <SectionHead eyebrow="שיעורים ותוכן" title="תכנים אחרונים" id="lessons-title" />
          <div className="grid grid--3">
            {latest.map((l) => (
              <LessonCard key={l.id} l={l} />
            ))}
          </div>
          <p style={{ marginTop: 22 }}>
            <Link to="/lessons" className="btn btn--ghost">
              לכל הספרייה
            </Link>
          </p>
        </div>
      </section>

      {/* ---------- אירועים ---------- */}
      <section className="section section--sand" aria-labelledby="events-title">
        <div className="container">
          <SectionHead eyebrow="אירועים" title="אירועים קרובים" id="events-title" />
          {upcoming.length ? (
            <div className="grid grid--2">
              {upcoming.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </div>
          ) : (
            <Placeholder title="אין כרגע אירועים מתוכננים">אירועים חדשים יפורסמו כאן.</Placeholder>
          )}
          <p style={{ marginTop: 22 }}>
            <Link to="/events" className="btn btn--ghost">
              לכל האירועים
            </Link>
          </p>
        </div>
      </section>

      {/* ---------- השפעה במספרים - רק נתונים מאושרים ---------- */}
      {site.impactStats.length ? (
        <section className="section section--white" aria-labelledby="impact-title">
          <div className="container">
            <SectionHead eyebrow="השפעה" title="במספרים" id="impact-title" center />
            <div className="grid grid--4">
              {site.impactStats.map((s) => (
                <div className="stat" key={s.label}>
                  <div className="stat__value">{s.value}</div>
                  <div className="muted">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : flags ? (
        <section className="section section--tight section--white" aria-label="השפעה במספרים">
          <div className="container">
            <Placeholder title='אזור "השפעה במספרים" מוסתר' todo="site.impactStats">
              יוצג רק לאחר שהמוסדות ימסרו ויאשרו נתונים. אין להציג מספרים משוערים.
            </Placeholder>
          </div>
        </section>
      ) : null}

      {/* ---------- עדויות - רק באישור ---------- */}
      {site.testimonials.length ? (
        <section className="section" aria-labelledby="t-title">
          <div className="container">
            <SectionHead eyebrow="מהלב" title="מילים שקיבלנו" id="t-title" center />
            <div className="grid grid--2">
              {site.testimonials.map((t) => (
                <figure className="card" key={t.text} style={{ margin: 0 }}>
                  <blockquote style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.25rem", color: "var(--ink)" }}>
                    “{t.text}”
                  </blockquote>
                  <figcaption className="muted" style={{ marginTop: 12 }}>
                    {t.attribution}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------- תרומה ---------- */}
      <section className="section section--tight" aria-labelledby="donate-title">
        <div className="container">
          <Reveal>
            <div className="donate-band">
              <div>
                <h2 id="donate-title">שותפים לתורה ולחסד</h2>
                <p>
                  התרומה מסייעת להחזקת הכוללים, לפעילות החסד ולפעילות בנות צילה. התרומה מתבצעת אצל ספק סליקה מאובטח - פרטי אשראי אינם נשמרים באתר. <Flag />
                </p>
              </div>
              <div className="btn-row">
                <DonateLink url={donation.generalUrl} />
                <Link to="/donate" className="btn btn--light">
                  פרטים נוספים
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- צור קשר ---------- */}
      <section className="section section--white" aria-labelledby="contact-title">
        <div className="container split split--wide-end">
          <div>
            <SectionHead eyebrow="צור קשר" title="נשמח לשמוע מכם" id="contact-title">
              <p>לשאלות, הצטרפות לפעילות או כל נושא אחר.</p>
            </SectionHead>
            <ContactDetails />
          </div>
          <div className="form-card">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
