import { ContactDetails } from "../components/ContactDetails";
import { ContactForm } from "../components/forms/Forms";
import { PageHero, SectionHead } from "../components/ui";

export default function Contact() {
  return (
    <>
      <PageHero title="צור קשר" lead="לשאלות, בקשות והצטרפות - נשמח לעמוד לרשותכם." />
      <section className="section">
        <div className="container split split--wide-end">
          <div>
            <SectionHead eyebrow="פרטים" title="דרכי התקשרות" />
            <ContactDetails />
          </div>
          <div className="form-card">
            <div className="form-card__head">
              <h2 style={{ fontSize: "1.6rem" }}>שליחת הודעה</h2>
              <p>נחזור אליכם בהקדם.</p>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
