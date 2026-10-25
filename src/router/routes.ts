import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type RouteDef = {
  path: string;
  title: string;
  description: string;
  component: LazyExoticComponent<ComponentType>;
};

const SITE = "קרן טללי ברכה · בנות צילה";

export const routes: RouteDef[] = [
  {
    path: "/",
    title: SITE,
    description: "קרן טללי ברכה - רשת כוללים בארץ ישראל, ובנות צילה. תורה, חסד, ליווי וחיזוק.",
    component: lazy(() => import("../pages/Home")),
  },
  {
    path: "/about",
    title: `אודות | ${SITE}`,
    description: "החזון והסיפור של קרן טללי ברכה ובנות צילה.",
    component: lazy(() => import("../pages/About")),
  },
  {
    path: "/keren-talelei-bracha",
    title: `קרן טללי ברכה | ${SITE}`,
    description: "קרן טללי ברכה - רשת כוללים בא״י: תורה, חסד, רווחה ופרויקטים.",
    component: lazy(() => import("../pages/TaleiBracha")),
  },
  {
    path: "/bnot-tzila",
    title: `בנות צילה | ${SITE}`,
    description: "בנות צילה - שיעורים, ערבי נשים, כנסים, תכני חיזוק ומיזם אישה לאישה.",
    component: lazy(() => import("../pages/BnotTzila")),
  },
  {
    path: "/isha-le-isha",
    title: `אישה לאישה | ${SITE}`,
    description: "מיזם שיחות אישיות ודיסקרטיות לחיזוק - בקשת שיחה והצטרפות כמלווה.",
    component: lazy(() => import("../pages/IshaLeIsha")),
  },
  {
    path: "/lessons",
    title: `שיעורים ותוכן | ${SITE}`,
    description: "ספריית שיעורים, הקלטות ומאמרים.",
    component: lazy(() => import("../pages/Lessons")),
  },
  {
    path: "/events",
    title: `אירועים | ${SITE}`,
    description: "אירועים קרובים, הרשמה ופרטי הגעה.",
    component: lazy(() => import("../pages/Events")),
  },
  {
    path: "/gallery",
    title: `גלריה | ${SITE}`,
    description: "תמונות מהפעילות.",
    component: lazy(() => import("../pages/Gallery")),
  },
  {
    path: "/donate",
    title: `תרומה | ${SITE}`,
    description: "תרומה לקרן טללי ברכה ולבנות צילה באמצעות סליקה מאובטחת.",
    component: lazy(() => import("../pages/Donate")),
  },
  {
    path: "/join",
    title: `הצטרפות והתנדבות | ${SITE}`,
    description: "הצטרפות לפעילות, התנדבות וקבלת עדכונים.",
    component: lazy(() => import("../pages/Join")),
  },
  {
    path: "/contact",
    title: `צור קשר | ${SITE}`,
    description: "יצירת קשר עם קרן טללי ברכה ובנות צילה.",
    component: lazy(() => import("../pages/Contact")),
  },
  {
    path: "/privacy",
    title: `מדיניות פרטיות | ${SITE}`,
    description: "מדיניות הפרטיות של האתר.",
    component: lazy(() => import("../pages/Privacy")),
  },
  {
    path: "/accessibility",
    title: `הצהרת נגישות | ${SITE}`,
    description: "הצהרת הנגישות של האתר.",
    component: lazy(() => import("../pages/AccessibilityStatement")),
  },
  {
    path: "/terms",
    title: `תנאי שימוש | ${SITE}`,
    description: "תנאי השימוש באתר.",
    component: lazy(() => import("../pages/Terms")),
  },
];

export const notFound: RouteDef = {
  path: "*",
  title: `העמוד לא נמצא | ${SITE}`,
  description: "העמוד המבוקש לא נמצא.",
  component: lazy(() => import("../pages/NotFound")),
};

export function matchRoute(path: string): RouteDef {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return routes.find((r) => r.path === clean) ?? notFound;
}
