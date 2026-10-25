import { GalleryAlbumView } from "../components/Content";
import { AssistanceForm } from "../components/forms/Forms";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { DonateLink, Flag, PageHero, Placeholder, SectionHead } from "../components/ui";
import { donation } from "../config/integrations";
import { runtime } from "../config/contentModel";
import { site } from "../config/site";
import { galleryAlbums, lessons, projects } from "../data/content";
import { Link } from "../router/Router";
import { LessonCard } from "../components/Content";

export default function TaleiBracha() {
  const tbLessons = lessons.filter((l) => l.brand === "tb").slice(0, 3);
  const album = galleryAlbums.find((a) => a.brand === "tb");

  return (
    <>
      <PageHero
        title={site.orgs.taleiBracha.name}
        lead={site.orgs.taleiBracha.tagline}
        crumbs={[{ label: site.orgs.taleiBracha.name }]}
        aside={
          <span style={{ display: "inline-block", background: "#fff", borderRadius: 24, padding: 10, boxShadow: "var(--shadow)" }}>
            <Logo org="taleiBracha" height={170} priority />
          </span>
        }
      >
        <nav className="anchor-nav" aria-label="ניווט בעמוד">
          <a href="#vision">חזון</a>
          <a href="#torah">תורה ושיעורים</a>
          <a href="#chesed">חסד ורווחה</a>
          <a href="#projects">פרויקטים</a>
          <a href="#updates">עדכונים</a>
        </nav>
      </PageHero>

      <section className="section" id="vision">
        <div className="container split">
          <div>
            <SectionHead eyebrow="חזון ופעילות" title="על הקרן" />
            {site.about.taleiBracha ? (
              <p style={{ fontSize: "1.12rem" }}>{site.about.taleiBracha}</p>
            ) : (
              <Placeholder title="חזון ופעילות הקרן - נוסח מאושר" todo="site.about.taleiBracha" />
            )}
          </div>
          <div className="card">
            <h3>במבט מהיר</h3>
            <ul className="feature-list">
              <li>
                <Icon name="book" />
                <span>
                  רשת כוללים בארץ ישראל <span className="muted">(כפי שמופיע בלוגו)</span>
                </span>
              </li>
              <li>
                <Icon name="hands" />
                <span>
                  חסד ורווחה <Flag />
                </span>
              </li>
              <li>
                <Icon name="heart" />
                <span>
                  בית לפעילות בנות צילה{" "}
                  <Link to="/bnot-tzila" className="text-link" style={{ display: "inline" }}>
                    לעמוד ←
                  </Link>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section section--white" id="torah">
        <div className="container">
          <SectionHead eyebrow="תורה" title="תורה ושיעורים">
            <p>הכוללים והשיעורים של הקרן.</p>
          </SectionHead>
          <Placeholder title="פירוט הכוללים והשיעורים" todo="tb.torah">
            מיקומים, מסגרות וזמני לימוד - לפי מה שהקרן תמסור ותאשר לפרסום.
          </Placeholder>
          <div className="grid grid--3" style={{ marginTop: 22 }}>
            {tbLessons.map((l) => (
              <LessonCard key={l.id} l={l} />
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="chesed">
        <div className="container">
          <SectionHead eyebrow="חסד" title="חסד, רווחה וסיוע למשפחות" />
          <Placeholder title="תיאור פעילות החסד" todo="tb.chesed">
            רק מה שהקרן מאשרת לפרסום, ובלי פרטים מזהים של משפחות.
          </Placeholder>

          <div className="form-card" style={{ marginTop: 26 }}>
            <div className="form-card__head">
              <h3>פנייה לסיוע</h3>
            </div>
            {site.features.assistanceForm ? (
              <AssistanceForm />
            ) : (
              <Placeholder title="טופס בקשת סיוע - ממתין להחלטת הקרן" todo="features.assistanceForm" inline>
                לפני הפעלה יש להחליט מי מקבל את הפניות, היכן נשמרות ולכמה זמן.
              </Placeholder>
            )}
          </div>
        </div>
      </section>

      <section className="section section--sand" id="projects">
        <div className="container">
          <SectionHead eyebrow="פרויקטים" title="פרויקטים קבועים ועונתיים" />
          {projects.length ? (
            <div className="grid grid--3">
              {projects.map((p) => (
                <article className="card" key={p.id}>
                  {p.demo ? <Flag kind="demo" /> : null}
                  <h3>{p.title}</h3>
                  <p className="muted">{p.description}</p>
                  {runtime.featureFlags.donations ? <DonateLink url={p.donationUrl ?? donation.generalUrl} label="לתרומה לפרויקט" className="btn btn--flame btn--sm" /> : null}
                </article>
              ))}
            </div>
          ) : (
            <Placeholder title="רשימת הפרויקטים תיווסף לאחר אישור" todo="data.projects" />
          )}
        </div>
      </section>

      <section className="section" id="updates">
        <div className="container">
          <SectionHead eyebrow="מהשטח" title="גלריה ועדכונים" />
          {album ? <GalleryAlbumView album={album} /> : null}
          <Link to="/gallery" className="btn btn--ghost">
            לגלריה המלאה
          </Link>
        </div>
      </section>
    </>
  );
}
