/** רכיבים משותפים למערכת הניהול: שורה עם החלקה, פעולות קשר, צבעי סטטוס */
import { useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";

export type Tone = "red" | "yellow" | "green" | "grey" | "none";

/** צבע לפי סטטוס: אדום - דורש טיפול, צהוב - בטיפול, ירוק - טופל/אושר, אפור - בוטל/ארכיון */
export function toneFor(status: string): Tone {
  if (status === "new") return "red";
  if (status === "in_progress") return "yellow";
  if (status === "done" || status === "approved") return "green";
  if (status === "archived" || status === "rejected") return "grey";
  return "none";
}

export const intlPhone = (p: string) => p.replace(/\D/g, "").replace(/^0/, "972");
export const waLink = (p: string, text = "") => `https://wa.me/${intlPhone(p)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

const THRESHOLD = 84;

/**
 * שורה עם החלקה (במגע):
 * החלקה שמאלה ← וואטסאפ · החלקה ימינה ← חיוג
 * בלחיצה רגילה - onClick.
 */
export function SwipeRow({
  phone,
  waText,
  tone = "none",
  current,
  onClick,
  children,
  label,
  actions,
}: {
  phone?: string;
  waText?: string;
  tone?: Tone;
  current?: boolean;
  onClick?: () => void;
  children: ReactNode;
  label?: string;
  /** כפתורי אייקון בקצה השורה (חיוג, וואטסאפ...) */
  actions?: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);
  const can = Boolean(phone);

  const end = () => {
    if (can && Math.abs(dx) >= THRESHOLD && phone) {
      if (navigator.vibrate) navigator.vibrate(15);
      if (dx < 0) window.open(waLink(phone, waText), "_blank", "noopener");
      else window.location.href = `tel:${phone}`;
    }
    setDx(0);
    start.current = null;
  };

  return (
    <div className={`adm-swipe ${can ? "" : "adm-swipe--off"}`}>
      {can ? (
        <div className={`adm-swipe__under ${dx < 0 ? "is-wa" : dx > 0 ? "is-call" : ""}`} aria-hidden="true">
          <span className="adm-swipe__call">
            <Icon name="phone" /> חיוג
          </span>
          <span className="adm-swipe__wa">
            וואטסאפ <Icon name="whatsapp" />
          </span>
        </div>
      ) : null}
      <button
        type="button"
        className={`adm-row adm-row--tone-${tone}${actions ? " adm-row--acts" : ""}`}
        aria-current={current ? "true" : undefined}
        aria-label={label}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : undefined }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" || !can) return;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || s.id !== e.pointerId) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (s.horizontal === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
            s.horizontal = Math.abs(mx) > Math.abs(my);
            if (s.horizontal) {
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* לא כל הדפדפנים מאפשרים לכידה - ממשיכים בלי */
              }
            }
          }
          if (s.horizontal) {
            moved.current = true;
            setDx(Math.max(-140, Math.min(140, mx)));
          }
        }}
        onPointerUp={end}
        onPointerCancel={() => {
          setDx(0);
          start.current = null;
        }}
        onClick={() => {
          if (moved.current) {
            moved.current = false;
            return;
          }
          onClick?.();
        }}
      >
        {children}
      </button>
      {actions && !dx ? <div className="adm-row__acts">{actions}</div> : null}
    </div>
  );
}

/** כפתורי קשר מהירים - תמיד ארבע פעולות באותו סדר */
export function ContactActions({ phone, email, waText, smsText }: { phone?: string; email?: string; waText?: string; smsText?: string }) {
  const phoneOk=Boolean(phone);
  const emailOk=Boolean(email);
  const disabled=(label:string,icon:"whatsapp"|"phone"|"chat"|"mail",reason:string,cls:string)=>(
    <span className={`adm-act ${cls} is-disabled`} aria-disabled="true" title={reason}>
      <Icon name={icon} /> {label}
    </span>
  );
  return (
    <div className="adm-contact-actions">
      {phoneOk ? (
        <a className="adm-act adm-act--wa" href={waLink(phone!, waText)} target="_blank" rel="noopener noreferrer">
          <Icon name="whatsapp" /> וואטסאפ
        </a>
      ) : disabled("וואטסאפ","whatsapp","לא הוזן מספר טלפון","adm-act--wa")}
      {phoneOk ? (
        <a className="adm-act adm-act--call" href={`tel:${phone}`}>
          <Icon name="phone" /> טלפון
        </a>
      ) : disabled("טלפון","phone","לא הוזן מספר טלפון","adm-act--call")}
      {phoneOk ? (
        <a className="adm-act adm-act--sms" href={`sms:${phone}${smsText ? `?&body=${encodeURIComponent(smsText)}` : ""}`}>
          <Icon name="chat" /> SMS
        </a>
      ) : disabled("SMS","chat","לא הוזן מספר טלפון","adm-act--sms")}
      {emailOk ? (
        <a className="adm-act adm-act--mail" href={`mailto:${email}`}>
          <Icon name="mail" /> מייל
        </a>
      ) : disabled("מייל","mail","לא הוזן מייל","adm-act--mail")}
    </div>
  );
}

export function SwipeHint() {
  return (
    <p className="adm-swipe-hint">
      <Icon name="arrowLeft" width={14} height={14} /> בפלאפון: החלקה שמאלה לוואטסאפ, ימינה לחיוג
    </p>
  );
}

/** מקרא צבעים */
export function ToneLegend({ items }: { items: { tone: Tone; label: string }[] }) {
  return (
    <div className="adm-legend" aria-label="מקרא צבעים">
      {items.map((i) => (
        <span key={i.label}>
          <i className={`adm-dot adm-dot--${i.tone}`} aria-hidden="true" />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export const money = (n: number) => `${n < 0 ? "\u200E-" : ""}${Math.abs(n).toLocaleString("he-IL")} ₪`;

/** כפתורי קשר - אייקונים בלבד (לשורות), תמיד ארבעה */
export function IconActions({ phone, email, waText, smsText }: { phone?: string; email?: string; waText?: string; smsText?: string }) {
  const disabled=(label:string,icon:"whatsapp"|"phone"|"chat"|"mail",cls:string)=>(
    <span className={`adm-ia ${cls} is-disabled`} aria-label={`${label} - חסר פרט קשר`} title={`${label} - חסר פרט קשר`}>
      <Icon name={icon} />
    </span>
  );
  return (
    <>
      {phone ? <a className="adm-ia adm-ia--wa" href={waLink(phone, waText)} target="_blank" rel="noopener noreferrer" aria-label="וואטסאפ" title="וואטסאפ"><Icon name="whatsapp" /></a> : disabled("וואטסאפ","whatsapp","adm-ia--wa")}
      {phone ? <a className="adm-ia adm-ia--call" href={`tel:${phone}`} aria-label="טלפון" title="טלפון"><Icon name="phone" /></a> : disabled("טלפון","phone","adm-ia--call")}
      {phone ? <a className="adm-ia adm-ia--sms" href={`sms:${phone}${smsText ? `?&body=${encodeURIComponent(smsText)}` : ""}`} aria-label="SMS" title="SMS"><Icon name="chat" /></a> : disabled("SMS","chat","adm-ia--sms")}
      {email ? <a className="adm-ia adm-ia--mail" href={`mailto:${email}`} aria-label="מייל" title="מייל"><Icon name="mail" /></a> : disabled("מייל","mail","adm-ia--mail")}
    </>
  );
}

/** כפתור פלוס צף */
export function Fab({ label, onClick, icon = "plus" }: { label: string; onClick: () => void; icon?: "plus" | "edit" }) {
  return (
    <button type="button" className="adm-fab" onClick={onClick} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}

/** צ'יפים לחיצים לסינון */
export function Chips<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="adm-chips" role="group">
      {items.map((i) => (
        <button key={i.id} type="button" className="adm-chip" aria-pressed={value === i.id} onClick={() => onChange(i.id)}>
          {i.label}
          {i.count !== undefined ? <span className="adm-chip__n">{i.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** כפתור ייצוא לאקסל - אייקון */
export function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="adm-icon-btn" onClick={onClick} aria-label="ייצוא לאקסל" title="ייצוא לאקסל">
      <Icon name="download" />
    </button>
  );
}

/** בחירה עם השלמה אוטומטית לפי תחילת הקלדה */
export function Combo({
  value,
  onChange,
  options,
  placeholder = "הקלדה לחיפוש…",
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string; sub?: string }[];
  placeholder?: string;
  label?: string;
}) {
  const selected = options.find((o) => o.id === value);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const q = (text ?? "").trim();
  const matches = (q
    ? [...options.filter((o) => o.label.startsWith(q)), ...options.filter((o) => !o.label.startsWith(q) && (o.label.includes(q) || o.sub?.includes(q)))]
    : options
  ).slice(0, 8);
  const pick = (id: string) => {
    onChange(id);
    setText(null);
    setOpen(false);
  };
  return (
    <div className="adm-combo">
      <input
        className="input"
        aria-label={label}
        placeholder={placeholder}
        value={text ?? selected?.label ?? ""}
        onFocus={() => {
          setText("");
          setOpen(true);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => (setOpen(false), setText(null)), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            pick(matches[0].id);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && matches.length ? (
        <div className="adm-combo__list" role="listbox">
          {matches.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === value} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.id)}>
              {o.label}
              {o.sub ? <small>{o.sub}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
