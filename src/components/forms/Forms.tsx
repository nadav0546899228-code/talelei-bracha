/**
 * הטפסים של האתר. השדות לפי מסמך האפיון - מינימום מידע נחוץ.
 */
import { Link } from "../../router/Router";
import { email, israeliPhone, maxLen, required } from "../../lib/validation";
import { Choices, Consent, FormShell, SelectField, TextArea, TextField, useForm } from "./FormKit";

const consentRule = [required("יש לאשר כדי להמשיך")];

function PrivacyConsent({ form }: { form: ReturnType<typeof useForm> }) {
  return (
    <Consent form={form} name="consent">
      קראתי את{" "}
      <Link to="/privacy" target="_blank">
        מדיניות הפרטיות
      </Link>{" "}
      ואני מסכימ/ה שיחזרו אליי בעקבות הפנייה.
    </Consent>
  );
}

/* ---------- מסלול א: בקשת שיחת חיזוק ---------- */
export function IshaRequestForm() {
  const form = useForm("ishaRequest", {
    name: { rules: [required("נא לכתוב שם פרטי או כינוי"), maxLen(40)] },
    contactMethod: { rules: [required("נא לבחור דרך חזרה")], initial: "שיחת טלפון" },
    phone: { rules: [required("נא להשאיר מספר לחזרה"), israeliPhone] },
    bestTime: { rules: [required("נא לבחור זמן נוח")] },
    note: { rules: [maxLen(300)] },
    consent: { rules: consentRule, initial: false },
  });
  return (
    <FormShell
      form={form}
      label="בקשת שיחת חיזוק"
      submitLabel="שליחת בקשה לשיחה"
      submitClass="btn btn--rose"
      successTitle="הבקשה התקבלה בדיסקרטיות"
      successText="אחת מהמלוות תיצור איתך קשר בזמן שבחרת. תודה על האמון."
    >
      <TextField form={form} name="name" label="שם פרטי או כינוי" required autoComplete="given-name" maxLength={40} hint="אין צורך בשם מלא." />
      <TextField form={form} name="phone" label="טלפון לחזרה" type="tel" inputMode="tel" required autoComplete="tel" />
      <Choices
        form={form}
        name="contactMethod"
        label="איך נוח לך שנחזור?"
        options={["שיחת טלפון", "הודעת וואטסאפ", "הודעת SMS"]}
        multiple={false}
        required
      />
      <Choices
        form={form}
        name="bestTime"
        label="מתי נוח לדבר?"
        options={["בוקר", "צהריים", "אחר הצהריים", "ערב", "לא משנה"]}
        multiple={false}
        required
      />
      <TextArea
        form={form}
        name="note"
        label="הערה"
        maxLength={300}
        hint="אפשר להשאיר ריק. אין צורך לכתוב כאן פרטים אישיים או סיפור - את מה שתרצי תוכלי לשתף בשיחה עצמה."
      />
      <PrivacyConsent form={form} />
    </FormShell>
  );
}

/* ---------- מסלול ב: הצטרפות כמלווה ---------- */
export function IshaMentorForm() {
  const form = useForm("ishaMentor", {
    fullName: { rules: [required("נא לכתוב שם מלא"), maxLen(60)] },
    phone: { rules: [required("נא להשאיר טלפון"), israeliPhone] },
    community: { rules: [maxLen(80)] },
    availability: { rules: [required("נא לבחור לפחות זמן אחד")], initial: [] },
    languages: { rules: [], initial: ["עברית"] },
    experience: { rules: [maxLen(500)] },
    note: { rules: [maxLen(300)] },
    consent: { rules: consentRule, initial: false },
  });
  return (
    <FormShell
      form={form}
      label="הצטרפות כמלווה"
      submitLabel="שליחת בקשת הצטרפות"
      submitClass="btn"
      successTitle="תודה על הרצון להצטרף!"
      successText="הבקשה התקבלה. נציגת המיזם תיצור קשר לשיחת היכרות ובדיקת התאמה."
    >
      <TextField form={form} name="fullName" label="שם מלא" required autoComplete="name" maxLength={60} />
      <TextField form={form} name="phone" label="טלפון" type="tel" inputMode="tel" required autoComplete="tel" />
      <TextField form={form} name="community" label="שיוך / קהילה" span hint="למשל: הכולל או הקהילה שאליהם את משתייכת." />
      <Choices
        form={form}
        name="availability"
        label="זמינות לשיחות"
        options={["בוקר", "צהריים", "אחר הצהריים", "ערב", "מוצאי שבת"]}
        required
      />
      <Choices
        form={form}
        name="languages"
        label="שפות שיחה"
        options={["עברית", "אנגלית", "צרפתית", "רוסית", "ספרדית", "אמהרית", "אחר"]}
      />
      <TextArea form={form} name="experience" label="ניסיון רלוונטי" maxLength={500} hint="ליווי, הדרכה, שיחות, חסד - כל מה שנראה לך רלוונטי." />
      <TextArea form={form} name="note" label="הערה" maxLength={300} />
      <PrivacyConsent form={form} />
    </FormShell>
  );
}

/* ---------- צור קשר ---------- */
export function ContactForm() {
  const form = useForm("contact", {
    name: { rules: [required("נא לכתוב שם"), maxLen(60)] },
    phone: { rules: [required("נא להשאיר טלפון"), israeliPhone] },
    email: { rules: [email] },
    subject: { rules: [required("נא לבחור נושא")] },
    message: { rules: [required("נא לכתוב הודעה"), maxLen(800)] },
    consent: { rules: consentRule, initial: false },
  });
  return (
    <FormShell form={form} label="טופס יצירת קשר" submitLabel="שליחת הודעה" successText="תודה! ההודעה התקבלה ונחזור בהקדם.">
      <TextField form={form} name="name" label="שם" required autoComplete="name" />
      <TextField form={form} name="phone" label="טלפון" type="tel" inputMode="tel" required autoComplete="tel" />
      <TextField form={form} name="email" label="מייל" type="email" inputMode="email" autoComplete="email" />
      <SelectField
        form={form}
        name="subject"
        label="נושא הפנייה"
        required
        options={["קרן טללי ברכה", "בנות צילה", "מיזם אישה לאישה", "שיעורים ואירועים", "תרומות", "התנדבות", "אחר"]}
      />
      <TextArea form={form} name="message" label="ההודעה" required maxLength={800} />
      <PrivacyConsent form={form} />
    </FormShell>
  );
}

/* ---------- הצטרפות והתנדבות ---------- */
export function VolunteerForm() {
  const form = useForm("volunteer", {
    name: { rules: [required("נא לכתוב שם"), maxLen(60)] },
    phone: { rules: [required("נא להשאיר טלפון"), israeliPhone] },
    interest: { rules: [required("נא לבחור לפחות תחום אחד")], initial: [] },
    note: { rules: [maxLen(400)] },
    consent: { rules: consentRule, initial: false },
  });
  return (
    <FormShell form={form} label="הצטרפות והתנדבות" submitLabel="שליחת בקשה" successText="תודה! ניצור קשר כדי להתאים את דרך ההצטרפות.">
      <TextField form={form} name="name" label="שם" required autoComplete="name" />
      <TextField form={form} name="phone" label="טלפון" type="tel" inputMode="tel" required autoComplete="tel" />
      <Choices
        form={form}
        name="interest"
        label="במה תרצו לקחת חלק?"
        options={["שיעורים ואירועים", "חסד ורווחה", "פעילות בנות צילה", "ליווי במיזם אישה לאישה", "עזרה בהפקת אירועים", "אחר"]}
        required
      />
      <TextArea form={form} name="note" label="כמה מילים עליך" maxLength={400} />
      <PrivacyConsent form={form} />
    </FormShell>
  );
}

/* ---------- קבלת עדכונים (בנות צילה) ---------- */
export function UpdatesForm() {
  const form = useForm("updates", {
    name: { rules: [required("נא לכתוב שם"), maxLen(40)] },
    phone: { rules: [required("נא להשאיר טלפון"), israeliPhone] },
    topics: { rules: [], initial: [] },
    consent: { rules: [required("יש לאשר קבלת עדכונים")], initial: false },
  });
  return (
    <FormShell
      form={form}
      label="קבלת עדכונים מבנות צילה"
      submitLabel="הצטרפות לעדכונים"
      submitClass="btn btn--rose"
      successText="נרשמת לעדכונים. אפשר להסיר את ההרשמה בכל עת."
    >
      <TextField form={form} name="name" label="שם" required autoComplete="given-name" />
      <TextField form={form} name="phone" label="טלפון (לעדכונים בוואטסאפ/SMS)" type="tel" inputMode="tel" required autoComplete="tel" />
      <Choices form={form} name="topics" label="על מה לעדכן?" options={["שיעורים", "ערבי נשים וכנסים", "תכני חיזוק", "התנדבות"]} />
      <Consent form={form} name="consent">
        אני מאשרת לקבל עדכונים מבנות צילה. ניתן להסיר את ההרשמה בכל עת.{" "}
        <Link to="/privacy" target="_blank">
          מדיניות הפרטיות
        </Link>
      </Consent>
    </FormShell>
  );
}

/* ---------- בקשת סיוע (מושבת עד החלטת הקרן) ---------- */
export function AssistanceForm() {
  const form = useForm("assistance", {
    name: { rules: [required("נא לכתוב שם"), maxLen(60)] },
    phone: { rules: [required("נא להשאיר טלפון"), israeliPhone] },
    note: { rules: [maxLen(300)] },
    consent: { rules: consentRule, initial: false },
  });
  return (
    <FormShell form={form} label="פנייה לסיוע" submitLabel="שליחת פנייה" successText="הפנייה התקבלה ותטופל בדיסקרטיות.">
      <TextField form={form} name="name" label="שם" required autoComplete="name" />
      <TextField form={form} name="phone" label="טלפון" type="tel" inputMode="tel" required autoComplete="tel" />
      <TextArea
        form={form}
        name="note"
        label="במה נוכל לעזור?"
        maxLength={300}
        hint="בקצרה בלבד. אין לצרף מסמכים או מידע רפואי/כלכלי באתר - הפרטים ייאספו בשיחה."
      />
      <PrivacyConsent form={form} />
    </FormShell>
  );
}
