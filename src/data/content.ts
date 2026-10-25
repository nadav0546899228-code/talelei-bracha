/**
 * מודל תוכן ציבורי וברירות מחדל בטוחות.
 *
 * הנתונים האמיתיים נטענים בזמן ריצה דרך /api/public/bootstrap ומוחלים ב-contentModel.
 * לכן ברירת המחדל כאן ריקה בכוונה: אם השרת אינו זמין, האתר מציג placeholders
 * ולא ממציא שיעורים, אירועים, פרויקטים או תמונות שלא אושרו לפרסום.
 */

export type Brand = "tb" | "bz";
export type ContentType = "video" | "audio" | "article";

export type Activity = {
  id: string;
  brand: Brand;
  title: string;
  summary: string;
  icon: "torah" | "chesed" | "women" | "support" | "events";
  to: string;
  draft?: boolean;
};

export type Lesson = {
  id: string;
  brand: Brand;
  type: ContentType;
  topic: string;
  title: string;
  summary?: string;
  speaker?: string;
  youtubeId?: string;
  url?: string;
  date?: string;
  location?: string;
  address?: string;
  demo?: boolean;
};

export type EventItem = {
  id: string;
  brand: Brand;
  title: string;
  start: string;
  location?: string;
  address?: string;
  audience?: string;
  description?: string;
  registrationUrl?: string;
  paymentUrl?: string;
  demo?: boolean;
};

export type Project = {
  id: string;
  title: string;
  description: string;
  donationUrl?: string;
  demo?: boolean;
};

export type GalleryImage = {
  id: string;
  src?: string;
  alt: string;
  width?: number;
  height?: number;
};

export type GalleryAlbum = {
  id: string;
  brand: Brand;
  title: string;
  category: string;
  images: GalleryImage[];
  demo?: boolean;
};

export const lessons: Lesson[] = [];
export const events: EventItem[] = [];
export const projects: Project[] = [];
export const galleryAlbums: GalleryAlbum[] = [];
