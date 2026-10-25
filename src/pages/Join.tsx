import { VolunteerForm } from "../components/forms/Forms";
import { Icon } from "../components/Icon";
import { PageHero, SectionHead } from "../components/ui";
import { Link } from "../router/Router";

export default function Join() {
  return (
    <>
      <PageHero title="הצטרפות והתנדבות" lead="רוצים לקחת חלק? יש מקום לכל אחד ואחת." />
      <section className="section">
        <div className="container">
          <div className="grid grid--3" style={{ marginBottom: 40 }}>
            <Link to="/isha-le-isha#mentor" className="card card--link card--bz">
              <span className="card__icon">
                <Icon name="chat" />
              </span>
              <h3>מלווה במיזם אישה לאישה</h3>
              <p className="muted">לנשות אברכים ולנשים מתאימות.</p>
              <span className="text-link">
                לטופס המלוות <Icon name="arrowLeft" />
              </span>
            </Link>
            <Link to="/bnot-tzila#updates" className="card card--link card--bz">
              <span className="card__icon">
                <Icon name="heart" />
              </span>
              <h3>עדכונים מבנות צילה</h3>
              <p className="muted">שיעורים, ערבי נשים וכנסים.</p>
              <span className="text-link">
                להרשמה לעדכונים <Icon name="arrowLeft" />
              </span>
            </Link>
            <Link to="/donate" className="card card--link">
              <span className="card__icon">
                <Icon name="gift" />
              </span>
              <h3>שותפות בתרומה</h3>
              <p className="muted">החזקת התורה והחסד.</p>
              <span className="text-link">
                לעמוד התרומה <Icon name="arrowLeft" />
              </span>
            </Link>
          </div>

          <div className="split split--wide-end">
            <SectionHead eyebrow="התנדבות" title="השאירו פרטים">
              <p>ספרו לנו במה תרצו לעזור, ונחזור אליכם לתיאום.</p>
            </SectionHead>
            <div className="form-card">
              <VolunteerForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
