import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { PageHero, Placeholder, SectionHead } from "../components/ui";
import { site } from "../config/site";
import { Link } from "../router/Router";

export default function About() {
  return (
    <>
      <PageHero
        title="אודות"
        lead="החזון, הסיפור והאנשים שמאחורי קרן טללי ברכה ובנות צילה."
      />

      <section className="section">
        <div className="container split split--wide-start">
          <div>
            <SectionHead eyebrow="החזון" title="מה מניע אותנו" />
            {site.vision ? <p style={{ fontSize: "1.15rem" }}>{site.vision}</p> : <Placeholder title="חזון המוסדות - נוסח מאושר" todo="site.vision" />}
            <div style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: "1.6rem" }}>הסיפור שלנו</h2>
              {site.about.story ? (
                <p>{site.about.story}</p>
              ) : (
                <Placeholder title="סיפור המוסדות" todo="site.about.story">
                  איך הכול התחיל, מה המטרות ומה נעשה בפועל - טקסט מאושר מהמוסדות.
                </Placeholder>
              )}
            </div>
          </div>
          <aside className="stack">
            <div className="card center">
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <Logo org="taleiBracha" height={150} />
              </div>
              <h3>{site.orgs.taleiBracha.name}</h3>
              <p className="muted">{site.orgs.taleiBracha.tagline}</p>
              <Link to="/keren-talelei-bracha" className="text-link">
                לעמוד הקרן <Icon name="arrowLeft" />
              </Link>
            </div>
            <div className="card card--bz center">
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <Logo org="bnotTzila" height={110} />
              </div>
              <h3>{site.orgs.bnotTzila.name}</h3>
              <Link to="/bnot-tzila" className="text-link">
                לעמוד בנות צילה <Icon name="arrowLeft" />
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          <SectionHead eyebrow="הנהלה" title="הנהלה ומייסדים" />
          <Placeholder title="שמות ותפקידים יוצגו רק לאחר מסירה ואישור" todo="about.team">
            אין להציג שמות רבנים, מנהלים או אנשי צוות שלא נמסרו במפורש.
          </Placeholder>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead eyebrow="שותפים" title="גופים תומכים והסכמות" />
          <Placeholder title="יוצג רק לאחר אישור" todo="about.partners">
            שותפים, חסויות והסכמות רבניות - רק כפי שיימסרו ויאושרו.
          </Placeholder>
        </div>
      </section>
    </>
  );
}
