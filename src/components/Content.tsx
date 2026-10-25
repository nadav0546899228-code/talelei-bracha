/** רכיבי תוכן: כרטיסי פעילות, שיעור, אירוע, גלריה ו-Lightbox */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Activity, EventItem, GalleryAlbum, Lesson } from "../data/content";
import { dayAndMonth, formatDate, formatHebrewDate, formatTime, mapsLink, wazeLink, whatsappShareLink } from "../lib/format";
import { Link } from "../router/Router";
import { Icon, type IconName } from "./Icon";
import { Flag } from "./ui";

const activityIcon: Record<Activity["icon"], IconName> = {
  torah: "book",
  chesed: "hands",
  women: "heart",
  support: "chat",
  events: "calendar",
};

export function ActivityCard({ a }: { a: Activity }) {
  return (
    <Link to={a.to} className={`card card--link ${a.brand === "bz" ? "card--bz" : ""}`}>
      {a.draft ? <Flag /> : null}
      <span className="card__icon">
        <Icon name={activityIcon[a.icon]} />
      </span>
      <h3>{a.title}</h3>
      <p className="muted">{a.summary}</p>
      <span className="text-link">
        למידע נוסף <Icon name="arrowLeft" />
      </span>
    </Link>
  );
}

const typeLabel: Record<Lesson["type"], { label: string; icon: IconName }> = {
  video: { label: "וידאו", icon: "play" },
  audio: { label: "אודיו", icon: "headphones" },
  article: { label: "מאמר", icon: "file" },
};

export function LessonCard({ l }: { l: Lesson }) {
  const [playing, setPlaying] = useState(false);
  const t = typeLabel[l.type];
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/lessons#${l.id}` : undefined;

  return (
    <article id={l.id} className={`card lesson-card ${l.brand === "bz" ? "lesson-card--bz" : ""}`}>
      {l.type === "video" ? (
        l.youtubeId && playing ? (
          <div className="lesson-card__media">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${l.youtubeId}?autoplay=1&rel=0`}
              title={l.title}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          <button
            type="button"
            className="lesson-card__media"
            onClick={() => l.youtubeId && setPlaying(true)}
            aria-label={l.youtubeId ? `ניגון: ${l.title}` : "סרטון יוזן בהמשך"}
            disabled={!l.youtubeId}
            style={!l.youtubeId ? { cursor: "default" } : undefined}
          >
            {l.youtubeId ? (
              <img
                src={`https://i.ytimg.com/vi/${l.youtubeId}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : null}
            <span className="lesson-card__play" style={{ position: "relative" }}>
              <Icon name="play" />
            </span>
          </button>
        )
      ) : (
        <div className="lesson-card__media" aria-hidden="true">
          <span className="lesson-card__play">
            <Icon name={t.icon} />
          </span>
        </div>
      )}
      <div className="lesson-card__body">
        <div className="card__meta">
          <span className={`tag ${l.brand === "bz" ? "tag--rose" : ""}`}>
            <Icon name={t.icon} />
            {t.label}
          </span>
          <span className="tag tag--sand">{l.topic}</span>
          {l.demo ? <Flag kind="demo" /> : null}
        </div>
        <h3>{l.title}</h3>
        {l.summary ? <p>{l.summary}</p> : null}
        <div className="lesson-card__foot">
          <span className="lesson-card__speaker">{l.speaker ?? "שם המרצה/ה יוזן"}</span>
          <span style={{ display: "flex", gap: 8 }}>
            {l.url ? (
              <a className="btn btn--ghost btn--sm" href={l.url} target="_blank" rel="noopener noreferrer">
                {l.type === "audio" ? "להאזנה" : "לקריאה"}
              </a>
            ) : null}
            <a
              className="btn btn--ghost btn--sm"
              href={whatsappShareLink(l.title, shareUrl)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`שיתוף "${l.title}" בוואטסאפ`}
            >
              <Icon name="share" />
              שיתוף
            </a>
          </span>
        </div>
      </div>
    </article>
  );
}

export function EventCard({ e, past = false }: { e: EventItem; past?: boolean }) {
  const dm = dayAndMonth(e.start);
  const heb = formatHebrewDate(e.start);
  return (
    <article className={`card event-card ${e.brand === "bz" ? "event-card--bz" : ""} ${past ? "event-card--past" : ""}`}>
      <div className="event-date" aria-hidden="true">
        <div className="event-date__month">{dm.month}</div>
        <div className="event-date__day">{dm.day}</div>
      </div>
      <div>
        <div className="card__meta">
          <span className={`tag ${e.brand === "bz" ? "tag--rose" : ""}`}>{e.brand === "bz" ? "בנות צילה" : "קרן טללי ברכה"}</span>
          {e.audience ? <span className="tag tag--sand">{e.audience}</span> : null}
          {e.demo ? <Flag kind="demo" /> : null}
        </div>
        <h3>{e.title}</h3>
        <ul className="event-meta">
          <li>
            <Icon name="calendar" />
            <span>
              {formatDate(e.start)}
              {heb ? ` · ${heb}` : ""}
            </span>
          </li>
          <li>
            <Icon name="clock" />
            <span>{formatTime(e.start)}</span>
          </li>
          <li>
            <Icon name="pin" />
            <span>{e.location ?? "המיקום יעודכן"}</span>
          </li>
        </ul>
        {e.description ? <p className="muted">{e.description}</p> : null}
        {!past ? (
          <div className="btn-row">
            {e.registrationUrl ? (
              <a className={`btn btn--sm ${e.brand === "bz" ? "btn--rose" : ""}`} href={e.registrationUrl} target="_blank" rel="noopener noreferrer">
                להרשמה
              </a>
            ) : (
              <span className="btn btn--sm" aria-disabled="true">
                ההרשמה תיפתח בקרוב
              </span>
            )}
            {e.paymentUrl ? (
              <a className="btn btn--flame btn--sm" href={e.paymentUrl} target="_blank" rel="noopener noreferrer">
                תשלום מאובטח
              </a>
            ) : null}
            {e.address ? (
              <>
                <a className="btn btn--ghost btn--sm" href={wazeLink(e.address)} target="_blank" rel="noopener noreferrer">
                  Waze
                </a>
                <a className="btn btn--ghost btn--sm" href={mapsLink(e.address)} target="_blank" rel="noopener noreferrer">
                  מפות
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function GalleryAlbumView({ album }: { album: GalleryAlbum }) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <section className="album" aria-labelledby={`album-${album.id}`}>
      <div className="album__head">
        <h2 id={`album-${album.id}`}>{album.title}</h2>
        <span className={`tag ${album.brand === "bz" ? "tag--rose" : ""}`}>{album.category}</span>
        {album.demo ? <Flag kind="demo" /> : null}
      </div>
      <div className="gallery-grid">
        {album.images.map((img, i) => (
          <button key={img.id} type="button" className="gallery-tile" onClick={() => setIndex(i)} aria-label={`הגדלה: ${img.alt}`}>
            {img.src ? <img src={img.src} alt={img.alt} loading="lazy" decoding="async" width={img.width} height={img.height} /> : <Icon name="image" />}
          </button>
        ))}
      </div>
      {index !== null ? <Lightbox album={album} index={index} onChange={setIndex} onClose={() => setIndex(null)} /> : null}
    </section>
  );
}

function Lightbox({
  album,
  index,
  onChange,
  onClose,
}: {
  album: GalleryAlbum;
  index: number;
  onChange: (i: number) => void;
  onClose: () => void;
}) {
  const n = album.images.length;
  const img = album.images[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const next = useCallback(() => onChange((index + 1) % n), [index, n, onChange]);
  const prev = useCallback(() => onChange((index - 1 + n) % n), [index, n, onChange]);

  useEffect(() => {
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // RTL: חץ שמאלה = הבא, חץ ימינה = הקודם
      if (e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
    };
    document.addEventListener("keydown", onKey);
    const openerEl = opener.current;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      (openerEl as HTMLElement | null)?.focus?.();
    };
  }, [next, prev, onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${album.title} - תמונה ${index + 1} מתוך ${n}`}>
      <div className="lightbox__bar">
        <span>
          {index + 1} / {n}
        </span>
        <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="סגירה">
          <Icon name="close" />
        </button>
      </div>
      <div className="lightbox__stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {img.src ? (
          <img src={img.src} alt={img.alt} />
        ) : (
          <div className="lightbox__empty">
            <div>
              <Icon name="image" width={40} height={40} style={{ margin: "0 auto 10px" }} />
              {img.alt}
            </div>
          </div>
        )}
      </div>
      <div className="lightbox__nav">
        <button type="button" className="icon-btn" onClick={prev} aria-label="התמונה הקודמת">
          <Icon name="arrowRight" />
        </button>
        <button type="button" className="icon-btn" onClick={next} aria-label="התמונה הבאה">
          <Icon name="arrowLeft" />
        </button>
      </div>
    </div>
  );
}
