/** רכיבי תצוגה קטנים לשימוש חוזר */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { site } from "../config/site";
import { Icon } from "./Icon";
import { Link } from "../router/Router";

/** משבצת לתוכן שטרם נמסר - במקום להמציא */
export function Placeholder({
  title = "התוכן יוזן לאחר אישור",
  children,
  inline = false,
  media = false,
  todo,
}: {
  title?: string;
  children?: ReactNode;
  inline?: boolean;
  media?: boolean;
  /** תיאור קצר למפתח: מה בדיוק חסר */
  todo?: string;
}) {
  return (
    <div
      className={`placeholder ${inline ? "placeholder--inline" : ""} ${media ? "placeholder--media" : ""}`}
      data-todo={todo}
      role="note"
    >
      <Icon name={media ? "image" : "edit"} />
      <div>
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

/** תגית "טיוטה"/"דוגמה" על תוכן זמני - מוסתרת כשמכבים showContentFlags */
export function Flag({ kind = "draft" }: { kind?: "draft" | "demo" }) {
  if (!site.features.showContentFlags) return null;
  return (
    <span className="flag" title={kind === "demo" ? "פריט דוגמה - יוחלף בתוכן אמיתי" : "ניסוח זמני - ממתין לאישור"}>
      {kind === "demo" ? "דוגמה" : "טיוטה לאישור"}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  children,
  center = false,
  rose = false,
  as: As = "h2",
  id,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  center?: boolean;
  rose?: boolean;
  as?: "h1" | "h2";
  id?: string;
}) {
  return (
    <div className={`section-head ${center ? "section-head--center" : ""}`}>
      {eyebrow ? <div className={`eyebrow ${rose ? "eyebrow--rose" : ""}`}>{eyebrow}</div> : null}
      <As id={id}>{title}</As>
      {children}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { to?: string; label: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="מיקום בעמוד">
      <ol>
        <li>
          <Link to="/">בית</Link>
        </li>
        {items.map((it) => (
          <li key={it.label}>
            {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHero({
  title,
  lead,
  crumbs,
  bz = false,
  aside,
  children,
}: {
  title: string;
  lead?: ReactNode;
  crumbs?: { to?: string; label: string }[];
  bz?: boolean;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={`page-hero ${bz ? "page-hero--bz" : ""}`}>
      <div className="container">
        <Breadcrumbs items={crumbs ?? [{ label: title }]} />
        <div className={`page-hero__grid ${aside ? "page-hero__grid--logo" : ""}`}>
          <div>
            <h1>{title}</h1>
            {lead ? <p className="page-hero__lead">{lead}</p> : null}
          </div>
          {aside ? <div className="page-hero__logo">{aside}</div> : null}
        </div>
        {children}
      </div>
    </header>
  );
}

/** הופעה עדינה בגלילה */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** כפתור/קישור תרומה - מושבת בבירור כל עוד לא הוגדר קישור סליקה */
export function DonateLink({
  url,
  label = "לתרומה מאובטחת",
  className = "btn btn--flame",
}: {
  url: string | null;
  label?: string;
  className?: string;
}) {
  if (!url) {
    return (
      <span className={className} aria-disabled="true" title="קישור הסליקה יוזן לאחר קבלתו מהמוסדות">
        <Icon name="lock" />
        קישור הסליקה יחובר בקרוב
      </span>
    );
  }
  return (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer">
      <Icon name="heart" />
      {label}
      <span className="visually-hidden">(נפתח בחלון חדש באתר הסליקה)</span>
    </a>
  );
}
