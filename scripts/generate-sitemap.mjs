// יוצר dist/sitemap.xml לפי רשימת העמודים.
// הכתובת נלקחת מהמשתנה SITE_URL (למשל https://example.org). אם לא הוגדר – נוצר sitemap עם כתובות יחסיות וסימון TODO.
import { writeFileSync, existsSync } from "node:fs";

const routes = [
  "/",
  "/about",
  "/keren-talelei-bracha",
  "/bnot-tzila",
  "/isha-le-isha",
  "/lessons",
  "/events",
  "/gallery",
  "/donate",
  "/join",
  "/contact",
  "/privacy",
  "/accessibility",
  "/terms",
];

const base = (process.env.SITE_URL || "").replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
${base ? "" : "<!-- TODO: להגדיר SITE_URL בסביבת הבנייה כדי לקבל כתובות מלאות -->\n"}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map((r) => `  <url><loc>${base}${r}</loc><lastmod>${today}</lastmod></url>`)
  .join("\n")}
</urlset>
`;

if (existsSync("dist")) {
  writeFileSync("dist/sitemap.xml", xml);
  console.log("sitemap.xml נוצר");
}
