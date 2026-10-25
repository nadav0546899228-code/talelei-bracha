import { IshaMentorForm, IshaRequestForm } from "../components/forms/Forms";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { PageHero, Placeholder, SectionHead } from "../components/ui";

export default function IshaLeIsha() {
  return (
    <>
      <PageHero
        bz
        title="אישה לאישה"
        lead="מיזם שיחות אישיות לנשים שעברו תהליך חיזוק - עם נשים מתאימות, ובפרט נשות אברכים מקרן טללי ברכה. בחום, בדיסקרטיות ובלי שיפוטיות."
        crumbs={[{ to: "/bnot-tzila", label: "בנות צילה" }, { label: "אישה לאישה" }]}
        aside={<Logo org="bnotTzila" height={150} priority />}
      >
        <div className="isha-paths" style={{ maxWidth: 820 }}>
          <a href="#request" className="path-card">
            <span className="path-card__num">א</span>
            <h2 style={{ fontSize: "1.35rem", margin: 0 }}>אני רוצה שיחת חיזוק</h2>
            <p>טופס קצר - והמלווה חוזרת אלייך.</p>
          </a>
          <a href="#mentor" className="path-card path-card--mentor">
            <span className="path-card__num">ב</span>
            <h2 style={{ fontSize: "1.35rem", margin: 0 }}>אני רוצה להיות מלווה</h2>
            <p>הצטרפות למיזם, בכפוף לשיחת התאמה.</p>
          </a>
        </div>
      </PageHero>

      <section className="section section--tight">
        <div className="container">
          <div className="grid grid--3">
            <div className="privacy-note">
              <Icon name="lock" />
              <div>
                <strong>דיסקרטיות מלאה.</strong> באתר לא מוצג מי פנתה, מי מלווה את מי ומה נאמר בשיחה.
              </div>
            </div>
            <div className="privacy-note">
              <Icon name="heart" />
              <div>
                <strong>בלי לספר סיפור באתר.</strong> מספיק שם או כינוי ודרך חזרה. את השאר - רק אם תרצי, בשיחה.
              </div>
            </div>
            <div className="privacy-note">
              <Icon name="users" />
              <div>
                <strong>מלוות מתאימות.</strong> המלוות מצטרפות בכפוף לשיחת התאמה ואישור המוסדות.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--blush" id="request" aria-labelledby="request-title">
        <div className="container split split--wide-end">
          <div>
            <SectionHead eyebrow="מסלול א" title="בקשת שיחת חיזוק" rose id="request-title">
              <p>
                ממלאים פרטים בסיסיים בלבד, ואחת המלוות תיצור קשר בזמן שבחרת. אפשר להשתמש בכינוי - אין צורך בשם מלא.
              </p>
            </SectionHead>
            <ul className="feature-list feature-list--rose">
              <li>
                <Icon name="check" />
                <span>שם פרטי או כינוי, טלפון וזמן נוח</span>
              </li>
              <li>
                <Icon name="check" />
                <span>הערה - רק אם רוצים, ובקצרה</span>
              </li>
              <li>
                <Icon name="check" />
                <span>הפרטים מגיעים רק לצוות המיזם</span>
              </li>
            </ul>
            <Placeholder title="תהליך הטיפול בפנייה" todo="isha.process">
              מי מקבלת את הפניות, תוך כמה זמן חוזרים ומה התהליך - יפורט לאחר שהמוסדות יגדירו.
            </Placeholder>
          </div>
          <div className="form-card form-card--bz">
            <div className="form-card__head">
              <h3>אני רוצה שיחת חיזוק</h3>
              <p>כל השדות קצרים. את מה שתרצי לשתף - בשיחה עצמה.</p>
            </div>
            <IshaRequestForm />
          </div>
        </div>
      </section>

      <section className="section" id="mentor" aria-labelledby="mentor-title">
        <div className="container split split--wide-end">
          <div>
            <SectionHead eyebrow="מסלול ב" title="הצטרפות כמלווה" id="mentor-title">
              <p>
                לנשות אברכים מקרן טללי ברכה ולנשים מתאימות שרוצות לתת מכוחן ולהיות אוזן קשבת.
              </p>
            </SectionHead>
            <div className="privacy-note" style={{ marginBottom: 18 }}>
              <Icon name="info" />
              <div>
                <strong>ההרשמה אינה אישור אוטומטי.</strong> לאחר מילוי הטופס תתקיים שיחת היכרות, והמוסדות מאשרים את ההתאמה.
              </div>
            </div>
            <Placeholder title="תנאי הצטרפות והכשרה" todo="isha.mentorCriteria">
              מי רשאית להצטרף כמלווה, האם יש הכשרה או ליווי מקצועי - לפי הגדרת המוסדות.
            </Placeholder>
          </div>
          <div className="form-card">
            <div className="form-card__head">
              <h3>אני רוצה להיות מלווה</h3>
              <p>הפרטים משמשים רק לבדיקת התאמה ולתיאום.</p>
            </div>
            <IshaMentorForm />
          </div>
        </div>
      </section>
    </>
  );
}
