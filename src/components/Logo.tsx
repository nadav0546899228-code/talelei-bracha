/**
 * הצגת הלוגואים המקוריים בלבד - ללא שינוי צבע, טקסט או יחס.
 * הגודל נקבע לפי גובה, והרוחב מחושב מיחס הקובץ המקורי, כך שאין עיוות.
 * לוגו טללי ברכה מוצג תמיד על משטח לבן (הלבן שבתוך השער והספר הוא חלק מהעיצוב).
 */
import { site } from "../config/site";

type Props = {
  org: "taleiBracha" | "bnotTzila";
  /** גובה בפיקסלים */
  height: number;
  /** האם הלוגו נטען מיד (Hero/Header) או בטעינה עצלה */
  priority?: boolean;
  className?: string;
};

export function Logo({ org, height, priority = false, className = "" }: Props) {
  const o = site.orgs[org];
  const width = Math.round(height * o.logo.ratio);
  return (
    <span
      className={`logo ${o.logo.requiresWhiteSurface ? "logo--white-surface" : ""} ${className}`}
      style={{ height, aspectRatio: String(o.logo.ratio) }}
    >
      <picture>
        <source srcSet={o.logo.webp} type="image/webp" />
        <img
          src={o.logo.png}
          alt={`הלוגו של ${o.name}`}
          width={width}
          height={height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // eslint-disable-next-line react/no-unknown-property
          fetchPriority={priority ? "high" : "auto"}
        />
      </picture>
    </span>
  );
}
