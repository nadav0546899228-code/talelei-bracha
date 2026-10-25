import { legalNav, publicSiteMode, site } from "../config/site";
import { runtime } from "../config/contentModel";
import { Link, useRouter } from "../router/Router";
import { Logo } from "./Logo";

export function Footer() {
  const { path } = useRouter();
  const mode = publicSiteMode(path);
  const c = site.contact;
  const bc = site.bnotContact;
  const hasContact = mode === "bnot" ? Boolean(bc.mobile || bc.landline || bc.whatsapp) : Boolean(c.phone || c.email || c.whatsapp || c.address);
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="footer-brand__logos">
            {mode === "bnot" ? (
              <span className="logo-tile"><Logo org="bnotTzila" height={78} /></span>
            ) : mode === "kollel" ? (
              <span className="logo-tile"><Logo org="taleiBracha" height={86} /></span>
            ) : (
              <>
                <span className="logo-tile"><Logo org="taleiBracha" height={84} /></span>
                <span className="logo-tile"><Logo org="bnotTzila" height={68} /></span>
              </>
            )}
          </div>
          <p>
            {mode === "bnot"
              ? site.orgs.bnotTzila.name
              : mode === "kollel"
                ? `${site.orgs.taleiBracha.name} - ${site.orgs.taleiBracha.tagline}`
                : `${site.orgs.taleiBracha.name} · ${site.orgs.bnotTzila.name}`}
          </p>
        </div>

        <nav aria-label="ניווט באתר">
          <h2>המוסדות</h2>
          <ul className="footer-links">
            <li>
              <Link to="/about">אודות</Link>
            </li>
            <li>
              <Link to="/keren-talelei-bracha">קרן טללי ברכה</Link>
            </li>
            <li>
              <Link to="/bnot-tzila">בנות צילה</Link>
            </li>
            <li>
              <Link to="/isha-le-isha">מיזם אישה לאישה</Link>
            </li>
            {runtime.featureFlags.donations ? <li><Link to="/donate">תרומה</Link></li> : null}
          </ul>
        </nav>

        <nav aria-label="תוכן ופעילות">
          <h2>תוכן ופעילות</h2>
          <ul className="footer-links">
            <li>
              <Link to="/lessons">שיעורים ותוכן</Link>
            </li>
            <li>
              <Link to="/events">אירועים</Link>
            </li>
            <li>
              <Link to="/gallery">גלריה</Link>
            </li>
            <li>
              <Link to="/join">הצטרפות והתנדבות</Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2>יצירת קשר</h2>
          {hasContact ? (
            <ul className="footer-links">
              {mode === "bnot" ? (
                <>
                  {bc.mobile ? <li>נייד: <a href={`tel:${bc.mobile.replace(/[^\d+]/g, "")}`}>{bc.mobile}</a></li> : null}
                  {bc.landline ? <li>טלפון: <a href={`tel:${bc.landline.replace(/[^\d+]/g, "")}`}>{bc.landline}</a></li> : null}
                  {bc.whatsapp ? <li><a href={`https://wa.me/${bc.whatsapp}`} target="_blank" rel="noopener noreferrer">וואטסאפ</a></li> : null}
                  {site.social.facebook ? <li><a href={site.social.facebook} target="_blank" rel="noopener noreferrer">פייסבוק</a></li> : null}
                  {site.social.instagram ? <li><a href={site.social.instagram} target="_blank" rel="noopener noreferrer">אינסטגרם</a></li> : null}
                </>
              ) : (
                <>
                  {c.phone ? <li>טלפון: <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a></li> : null}
                  {c.whatsapp ? <li><a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener noreferrer">וואטסאפ</a></li> : null}
                  {c.email ? <li><a href={`mailto:${c.email}`}>{c.email}</a></li> : null}
                  {c.address ? <li>{c.address}</li> : null}
                </>
              )}
            </ul>
          ) : (
            <p className="footer-todo">פרטי הקשר יפורסמו לאחר אישור המוסדות.</p>
          )}
          <p>
            <Link to="/contact">לטופס יצירת קשר ←</Link>
          </p>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>
          © {year} {site.orgs.taleiBracha.name} · {site.orgs.bnotTzila.name}. כל הזכויות שמורות.
        </span>
        <ul>
          {legalNav.map((l) => (
            <li key={l.to}>
              <Link to={l.to}>{l.label}</Link>
            </li>
          ))}
          <li>
            <Link to="/admin">כניסת צוות</Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
