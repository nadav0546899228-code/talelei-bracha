import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";
import { Link } from "../router/Router";

export default function Home() {
  return (
    <section className="public-gateway" aria-labelledby="gateway-title">
      <div className="container public-gateway__inner">
        <header className="public-gateway__head">
          <span>ברוכים הבאים</span>
          <h1 id="gateway-title">לאיזה בית תרצו להיכנס?</h1>
          <p>שני עולמות פעילות, כל אחד עם התוכן, הניווט והשפה שלו.</p>
        </header>

        <div className="public-gateway__choices">
          <Link to="/keren-talelei-bracha" className="public-choice public-choice--kollel">
            <span className="public-choice__glow" />
            <div className="public-choice__logo"><Logo org="taleiBracha" height={150} priority /></div>
            <div className="public-choice__copy">
              <span className="eyebrow">עולם התורה</span>
              <h2>קרן טללי ברכה</h2>
              <p>רשת כוללים בא״י, תורה, קהילה ופעילות הקרן.</p>
              <span className="public-choice__enter">כניסה לאתר הקרן <Icon name="arrowLeft" /></span>
            </div>
          </Link>

          <Link to="/bnot-tzila" className="public-choice public-choice--bnot">
            <span className="public-choice__glow" />
            <div className="public-choice__logo"><Logo org="bnotTzila" height={132} priority /></div>
            <div className="public-choice__copy">
              <span className="eyebrow eyebrow--rose">עולם הנשים</span>
              <h2>בנות צילה</h2>
              <p>שיעורים, אירועים, חיזוק, קהילה ומיזם אישה לאישה.</p>
              <span className="public-choice__enter">כניסה לאתר בנות צילה <Icon name="arrowLeft" /></span>
            </div>
          </Link>
        </div>

        <div className="public-gateway__staff">
          <Link to="/admin"><Icon name="lock" /> כניסת צוות</Link>
        </div>
      </div>
    </section>
  );
}
