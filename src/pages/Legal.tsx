/** תבנית לעמודים משפטיים - בסיס לאישור משפטי לפני פרסום */
import type { ReactNode } from "react";
import { PageHero } from "../components/ui";
import { site } from "../config/site";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <PageHero title={title} />
      <section className="section">
        <div className="container">
          <div className="prose">
            <div className="legal-note" role="note">
              טיוטה בסיסית בלבד - יש להעביר לבדיקה ואישור משפטי לפני פרסום סופי. פרטי הגורם האחראי יושלמו לאחר אישור.
            </div>
            {children}
            <p className="muted" style={{ marginTop: 30 }}>
              {site.orgs.taleiBracha.name} · {site.orgs.bnotTzila.name} · עדכון אחרון: [TODO: תאריך האישור]
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
