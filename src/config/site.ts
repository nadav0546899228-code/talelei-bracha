/**
 * הגדרות האתר - כל התוכן שאפשר להחליף בלי לגעת בקוד הקומפוננטות.
 *
 * כלל ברזל: אין להמציא פרטים. כל ערך שעדיין לא נמסר ואושר על ידי המוסדות נשאר null,
 * והאתר מציג במקומו סימון "התוכן יוזן לאחר אישור".
 */

type LogoDef = { webp: string; png: string; ratio: number; requiresWhiteSurface: boolean };
type OrgDef = { name: string; tagline: string | null; logo: LogoDef };
export type SiteConfig = {
  orgs: { taleiBracha: OrgDef; bnotTzila: OrgDef };
  vision: string | null;
  about: { taleiBracha: string | null; bnotTzila: string | null; story: string | null };
  contact: {
    phone: string | null;
    whatsapp: string | null;
    whatsappMessage: string | null;
    email: string | null;
    address: string | null;
    hours: string | null;
  };
  social: { youtube: string | null; facebook: string | null; instagram: string | null };
  impactStats: { value: string; label: string }[];
  testimonials: { text: string; attribution: string }[];
  features: {
    assistanceForm: boolean;
    floatingWhatsapp: boolean;
    donationDedication: boolean;
    showContentFlags: boolean;
  };
};

export const site: SiteConfig = {
  /** שמות רשמיים לפי הכיתוב בלוגו המקורי (הלוגו הוא הקובע) */
  orgs: {
    taleiBracha: {
      name: "קרן טללי ברכה",
      tagline: "רשת כוללים בא״י", // מופיע בלוגו המקורי
      logo: {
        webp: "/brand/logo-keren-talelei-bracha.webp",
        png: "/brand/logo-keren-talelei-bracha.png",
        /** יחס רוחב/גובה של הקובץ המקורי - לשמירה על הלוגו ללא עיוות */
        ratio: 1505 / 1433,
        /** הלבן שבתוך השער והספר הוא חלק מהעיצוב - הלוגו מוצג תמיד על משטח לבן */
        requiresWhiteSurface: true,
      },
    },
    bnotTzila: {
      name: "בנות צילה",
      tagline: null, // TODO: משפט מאושר לבנות צילה
      logo: {
        webp: "/brand/logo-bnot-tzila.webp",
        png: "/brand/logo-bnot-tzila.png",
        ratio: 1008 / 781,
        requiresWhiteSurface: false,
      },
    },
  },

  /** משפט חזון לדף הבית - TODO: נוסח מאושר מהמוסדות */
  vision: null,

  /** טקסטים מאושרים - TODO */
  about: {
    taleiBracha: null,
    bnotTzila: null,
    story: null,
  },

  /** פרטי קשר לפרסום - TODO: יש למלא רק פרטים שאושרו לפרסום */
  contact: {
    phone: null,
    whatsapp: null, // בפורמט בינלאומי ללא +, למשל 9725XXXXXXXX
    whatsappMessage: null, // נוסח מאושר להודעת פתיחה
    email: null,
    address: null,
    hours: null,
  },

  /** רשתות חברתיות - TODO */
  social: {
    youtube: null,
    facebook: null,
    instagram: null,
  },

  /** נתוני "השפעה במספרים" - רק נתונים שנמסרו ואושרו. כל עוד הרשימה ריקה - האזור מוסתר. */
  impactStats: [],

  /** עדויות/סיפורים - רק באישור ובעילום שם לפי הצורך. רשימה ריקה = האזור מוסתר. */
  testimonials: [],

  /** מתגים */
  features: {
    /** טופס בקשת סיוע בעמוד הקרן - רק אם הקרן תחליט לאפשר */
    assistanceForm: false,
    /** כפתור וואטסאפ צף - יופעל רק כשיש מספר ונוסח מאושרים */
    floatingWhatsapp: true,
    /** אפשרות הקדשה בתרומה (לעילוי נשמת/לרפואה/להצלחה) - רק אם המוסדות רוצים */
    donationDedication: false,
    /** הצגת תגיות "טיוטה/דוגמה" על תוכן זמני. לכבות לפני פרסום סופי. */
    showContentFlags: true,
  },
};

/** סביבה: אתר פיתוח מציג פס "אתר פיתוח" */
export const isDevSite =
  import.meta.env.DEV ||
  import.meta.env.VITE_SITE_ENV === "development" ||
  /(\.replit\.dev|localhost|127\.0\.0\.1)$/.test(window.location.hostname);

export type NavItem = { to: string; label: string; children?: NavItem[] };

export const mainNav: NavItem[] = [
  { to: "/", label: "בית" },
  { to: "/about", label: "אודות" },
  { to: "/keren-talelei-bracha", label: "קרן טללי ברכה" },
  { to: "/bnot-tzila", label: "בנות צילה" },
  { to: "/isha-le-isha", label: "אישה לאישה" },
  {
    to: "/lessons",
    label: "תוכן ופעילות",
    children: [
      { to: "/lessons", label: "שיעורים ותוכן" },
      { to: "/events", label: "אירועים" },
      { to: "/gallery", label: "גלריה" },
    ],
  },
  { to: "/join", label: "הצטרפות" },
  { to: "/contact", label: "צור קשר" },
];

export const legalNav: NavItem[] = [
  { to: "/privacy", label: "מדיניות פרטיות" },
  { to: "/accessibility", label: "הצהרת נגישות" },
  { to: "/terms", label: "תנאי שימוש" },
];
