import { useMemo, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import type { Me } from "./api";
import type { Mode } from "./nav";

type Step = { icon: IconName; title: string; text: string };

const STEPS: Record<Mode, Step[]> = {
  boys: [
    { icon: "grid", title: "לוח הבקרה", text: "כאן רואים מיד מה דורש טיפול, כמה אברכים פעילים, מה החודש הפתוח ומה חדש במערכת." },
    { icon: "book", title: "כולל ערב", text: "אברכים, נסיעות, הוצאות ונוכחות נמצאים יחד תחת כולל ערב. כל משתמש רואה רק את הסניפים והמידע שמותר לו." },
    { icon: "bell", title: "התראות במקום הוראות", text: "במקום טקסטים קבועים על המסך, הפעמון מציג רק דברים שדורשים פעולה עכשיו." },
    { icon: "sparkle", title: "עבודה מהירה", text: "הפעולות המרכזיות זמינות מלוח הבקרה ומהניווט. אין צורך לזכור איפה כל דבר נמצא." },
  ],
  girls: [
    { icon: "grid", title: "לוח הבקרה", text: "כאן רואים בקשות חדשות, מלוות פעילות ופריטים שדורשים טיפול." },
    { icon: "heart", title: "בנות צילה", text: "משתתפות, פעילויות ומיזם אישה לאישה מרוכזים במקום אחד, לפי ההרשאות שלך." },
    { icon: "bell", title: "התראות במקום הוראות", text: "המערכת מציגה התראות רק כשיש משהו שדורש תשומת לב, בלי הסברים קבועים שמעמיסים על המסך." },
    { icon: "sparkle", title: "עבודה מהירה", text: "אפשר להגיע לכל הפעולות המרכזיות מהניווט או מקיצורי הדרך בלוח הבקרה." },
  ],
};

export const guideKey = (me: Me, mode: Mode) => `tb-guide-v1:${me.user.id}:${mode}`;

export function FirstRunGuide({ me, mode, onClose }: { me: Me; mode: Mode; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = useMemo(() => STEPS[mode], [mode]);
  const cur = steps[step];
  const finish = () => {
    try {
      localStorage.setItem(guideKey(me, mode), "1");
    } catch {
      /* לא קריטי */
    }
    onClose();
  };

  return (
    <div className="adm-guide-back" role="dialog" aria-modal="true" aria-label="הדרכה קצרה">
      <div className="adm-guide">
        <div className="adm-guide__top">
          <span className="adm-guide__mark"><Icon name={cur.icon} /></span>
          <button type="button" className="adm-icon-btn" aria-label="סגירת הדרכה" onClick={finish}>
            <Icon name="close" />
          </button>
        </div>

        <div className="adm-guide__body">
          <span className="adm-eyebrow">{mode === "boys" ? "קרן טללי ברכה" : "בנות צילה"}</span>
          <h2>{step === 0 ? "ברוכים הבאים" : cur.title}</h2>
          {step === 0 ? <h3>{cur.title}</h3> : null}
          <p>{cur.text}</p>
        </div>

        <div className="adm-guide__dots" aria-label={`שלב ${step + 1} מתוך ${steps.length}`}>
          {steps.map((_, i) => <span key={i} className={i === step ? "is-active" : ""} />)}
        </div>

        <div className="adm-guide__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={finish}>דלג</button>
          <div />
          {step > 0 ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setStep((s) => s - 1)}>הקודם</button>
          ) : null}
          <button type="button" className="btn btn--sm" onClick={() => step === steps.length - 1 ? finish() : setStep((s) => s + 1)}>
            {step === steps.length - 1 ? "סיום" : "הבא"}
          </button>
        </div>
      </div>
    </div>
  );
}
