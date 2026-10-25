/**
 * מודל התוכן הניתן לעריכה ממערכת הניהול.
 * בעליית האתר נטען התוכן מהשרת ומוחל על ברירות המחדל (site.ts / content.ts / integrations.ts).
 * אם השרת לא זמין - האתר מוצג עם ברירות המחדל.
 */
import { donation, type DonationConfig } from "./integrations";
import { site, type SiteConfig } from "./site";
import {
  events,
  galleryAlbums,
  lessons,
  projects,
  type EventItem,
  type GalleryAlbum,
  type Lesson,
  type Project,
} from "../data/content";

export type SiteContent = {
  texts: {
    vision: string | null;
    aboutTaleiBracha: string | null;
    aboutBnotTzila: string | null;
    story: string | null;
    bnotTzilaTagline: string | null;
  };
  contact: SiteConfig["contact"];
  social: SiteConfig["social"];
  donation: DonationConfig;
  features: SiteConfig["features"];
  impactStats: SiteConfig["impactStats"];
  testimonials: SiteConfig["testimonials"];
  lessons: Lesson[];
  events: EventItem[];
  projects: Project[];
  galleryAlbums: GalleryAlbum[];
};

export type Runtime = {
  googleClientId: string | null;
  env: "development" | "production" | "static";
  devLogin: boolean;
  demo?: boolean;
  serverAvailable: boolean;
  featureFlags: { donations: boolean };
};

export const runtime: Runtime = { googleClientId: null, env: "static", devLogin: false, serverAvailable: false, featureFlags: { donations: false } };

/** תמונת מצב של התוכן הנוכחי (ברירות מחדל + מה שנטען) - משמשת את עורך התוכן */
export function currentContent(): SiteContent {
  return structuredClone({
    texts: {
      vision: site.vision,
      aboutTaleiBracha: site.about.taleiBracha,
      aboutBnotTzila: site.about.bnotTzila,
      story: site.about.story,
      bnotTzilaTagline: site.orgs.bnotTzila.tagline,
    },
    contact: site.contact,
    social: site.social,
    donation,
    features: site.features,
    impactStats: site.impactStats,
    testimonials: site.testimonials,
    lessons,
    events,
    projects,
    galleryAlbums,
  });
}

const replace = <T,>(arr: T[], next: T[] | undefined) => {
  if (Array.isArray(next)) arr.splice(0, arr.length, ...next);
};

export function applyContent(c: Partial<SiteContent> | null | undefined) {
  if (!c) return;
  if (c.texts) {
    site.vision = c.texts.vision ?? site.vision;
    site.about.taleiBracha = c.texts.aboutTaleiBracha ?? site.about.taleiBracha;
    site.about.bnotTzila = c.texts.aboutBnotTzila ?? site.about.bnotTzila;
    site.about.story = c.texts.story ?? site.about.story;
    site.orgs.bnotTzila.tagline = c.texts.bnotTzilaTagline ?? site.orgs.bnotTzila.tagline;
  }
  if (c.contact) Object.assign(site.contact, c.contact);
  if (c.social) Object.assign(site.social, c.social);
  if (c.donation) Object.assign(donation, c.donation);
  if (c.features) Object.assign(site.features, c.features);
  replace(site.impactStats, c.impactStats);
  replace(site.testimonials, c.testimonials);
  replace(lessons, c.lessons);
  replace(events, c.events);
  replace(projects, c.projects);
  replace(galleryAlbums, c.galleryAlbums);
}

/** טעינה בעליית האתר - עם הגבלת זמן כדי לא לעכב את התצוגה */
export async function loadContent(timeoutMs = 2500) {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/public/bootstrap", { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return;
    const data = await res.json();
    runtime.googleClientId = data.googleClientId ?? null;
    runtime.env = data.env ?? "production";
    runtime.devLogin = Boolean(data.devLogin);
    runtime.demo = Boolean(data.demo);
    runtime.featureFlags = { donations: data.featureFlags?.donations === true };
    runtime.serverAvailable = true;
    applyContent(data.content);
  } catch {
    /* אין שרת (תצוגה סטטית) - ממשיכים עם ברירות המחדל */
  } finally {
    window.clearTimeout(t);
  }
}
