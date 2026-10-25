/**
 * חיבורים חיצוניים - שכבה אחת שקל להחליף בה ספק.
 * אין לשים כאן מפתחות API או סודות! זהו קוד צד-לקוח שכל אחד יכול לראות.
 * הסודות נשמרים בצד השרת בלבד (Secrets ב-Replit).
 */

export type FormId =
  | "ishaRequest" // בקשת שיחת חיזוק
  | "ishaMentor" // הצטרפות כמלווה
  | "contact"
  | "volunteer"
  | "updates" // קבלת עדכונים מבנות צילה
  | "assistance"; // בקשת סיוע (מושבת כברירת מחדל)

export type FormEndpoint = {
  /** כתובת POST שמקבלת JSON. null = הטופס עדיין לא חובר - שום מידע לא נשלח ולא נשמר. */
  url: string | null;
};

/** ברירת מחדל: השרת של האתר עצמו (server/index.mjs) שומר את הפניות במסד ומציג אותן במערכת הניהול */
const own = (id: FormId) => `/api/forms/${id}`;

export const formEndpoints: Record<FormId, FormEndpoint> = {
  ishaRequest: { url: own("ishaRequest") },
  ishaMentor: { url: own("ishaMentor") },
  contact: { url: own("contact") },
  volunteer: { url: own("volunteer") },
  updates: { url: own("updates") },
  assistance: { url: own("assistance") },
};

/** סליקה - קישור לעמוד תרומה מאובטח אצל ספק חיצוני. אין לשמור פרטי אשראי באתר. */
export type DonationConfig = {
  /** TODO: קישור הסליקה הקיים של המוסדות (נדרים פלוס / קהילות / JGive וכד׳) - נערך ממערכת הניהול */
  generalUrl: string | null;
  /** שם הספק להצגה */
  providerName: string | null;
  /** האם הספק תומך בתרומה חודשית (הוראת קבע) */
  supportsMonthly: boolean;
  /** האם יש למוסדות אישור סעיף 46 - לא להציג עד שנמסר */
  section46: boolean | null;
};

export const donation: DonationConfig = {
  generalUrl: null,
  providerName: null,
  supportsMonthly: false,
  section46: null,
};
