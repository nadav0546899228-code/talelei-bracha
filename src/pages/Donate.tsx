import { Icon } from "../components/Icon";
import { DonateLink, PageHero, Placeholder, SectionHead } from "../components/ui";
import { donation } from "../config/integrations";
import { site } from "../config/site";
import { projects } from "../data/content";

export default function Donate() {
  return (
    <>
      <PageHero title="תרומה" lead="שותפות בהחזקת התורה, בפעילות החסד ובפעילות בנות צילה." />

      <section className="section">
        <div className="container split split--wide-end">
          <div>
            <SectionHead eyebrow="איך זה עובד" title="תרומה מאובטחת" />
            <ul className="feature-list">
              <li>
                <Icon name="lock" />
                <span>התרומה מתבצעת באתר ספק סליקה מאובטח. פרטי אשראי <strong>אינם נשמרים</strong> באתר הזה.</span>
              </li>
              <li>
                <Icon name="gift" />
                <span>
                  {donation.supportsMonthly ? "אפשר לתרום חד-פעמית או בהוראת קבע חודשית." : "תרומה חד-פעמית או חודשית - לפי מה שספק הסליקה יאפשר."}
                </span>
              </li>
              <li>
                <Icon name="file" />
                <span>
                  {donation.section46 === true
                    ? "התרומה מוכרת לצורכי מס לפי סעיף 46."
                    : "קבלה לצורכי מס - הפרטים יעודכנו לאחר אישור המוסדות."}
                </span>
              </li>
            </ul>
            {!donation.providerName ? (
              <Placeholder title="ספק הסליקה וקישור התרומה" todo="integrations.donation">
                יש להזין את קישור הסליקה הקיים של המוסדות. עד אז הכפתור מושבת.
              </Placeholder>
            ) : null}
          </div>

          <div className="donate-band" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <h2>לתרומה</h2>
              <p>בחירת יעד התרומה, סכום ותדירות - בעמוד הסליקה המאובטח.</p>
            </div>
            <DonateLink url={donation.generalUrl} />
          </div>
        </div>
      </section>

      <section className="section section--white">
        <div className="container">
          <SectionHead eyebrow="יעדי תרומה" title="למה תרצו לתרום?">
            <p>אם ספק הסליקה תומך - אפשר לבחור יעד.</p>
          </SectionHead>
          {projects.length ? (
            <div className="grid grid--3">
              {projects.map((p) => (
                <article key={p.id} className="card">
                  <h3>{p.title}</h3>
                  <p className="muted">{p.description}</p>
                  <DonateLink url={p.donationUrl ?? donation.generalUrl} className="btn btn--flame btn--sm" />
                </article>
              ))}
            </div>
          ) : (
            <div className="grid grid--3">
              {[site.orgs.taleiBracha.name, site.orgs.bnotTzila.name, "חסד ורווחה"].map((t) => (
                <article key={t} className="card">
                  <h3>{t}</h3>
                  <Placeholder inline title="הסבר על היעד יוזן לאחר אישור" />
                </article>
              ))}
            </div>
          )}
          {site.features.donationDedication ? (
            <p className="muted" style={{ marginTop: 20 }}>
              אפשר להקדיש את התרומה לעילוי נשמת, לרפואה או להצלחה - בעמוד הסליקה.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
