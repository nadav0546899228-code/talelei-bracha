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
}: {
  phone?: string;
  waText?: string;
  tone?: Tone;
  current?: boolean;
  onClick?: () => void;
  children: ReactNode;
  label?: string;
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
        className={`adm-row adm-row--tone-${tone}`}
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
    </div>
  );
}

/** כפתורי קשר מהירים */
export function ContactActions({ phone, email, waText, smsText }: { phone?: string; email?: string; waText?: string; smsText?: string }) {
  if (!phone && !email) return null;
  return (
    <div className="adm-contact-actions">
      {phone ? (
        <>
          <a className="adm-act adm-act--wa" href={waLink(phone, waText)} target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" /> וואטסאפ
          </a>
          <a className="adm-act adm-act--call" href={`tel:${phone}`}>
            <Icon name="phone" /> חיוג
          </a>
          <a className="adm-act adm-act--sms" href={`sms:${phone}${smsText ? `?&body=${encodeURIComponent(smsText)}` : ""}`}>
            <Icon name="chat" /> SMS
          </a>
        </>
      ) : null}
      {email ? (
        <a className="adm-act adm-act--mail" href={`mailto:${email}`}>
          <Icon name="mail" /> מייל
        </a>
      ) : null}
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
