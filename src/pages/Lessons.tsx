import { useMemo, useState } from "react";
import { LessonCard } from "../components/Content";
import { PageHero, Placeholder } from "../components/ui";
import { lessons, type ContentType } from "../data/content";

const typeOptions: { v: ContentType | "all"; label: string }[] = [
  { v: "all", label: "הכול" },
  { v: "video", label: "וידאו" },
  { v: "audio", label: "אודיו" },
  { v: "article", label: "מאמרים" },
];

export default function Lessons() {
  const [type, setType] = useState<ContentType | "all">("all");
  const [topic, setTopic] = useState<string>("all");
  const [brand, setBrand] = useState<"all" | "tb" | "bz">("all");

  const topics = useMemo(() => Array.from(new Set(lessons.map((l) => l.topic))), []);
  const list = lessons.filter(
    (l) => (type === "all" || l.type === type) && (topic === "all" || l.topic === topic) && (brand === "all" || l.brand === brand),
  );

  return (
    <>
      <PageHero title="שיעורים ותוכן" lead="שיעורי וידאו, הקלטות ומאמרים - לצפייה, להאזנה ולשיתוף." />
      <section className="section">
        <div className="container">
          <div className="filters" role="group" aria-label="סינון לפי סוג תוכן">
            {typeOptions.map((o) => (
              <button key={o.v} type="button" className="filter-btn" aria-pressed={type === o.v} onClick={() => setType(o.v)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="filters" role="group" aria-label="סינון לפי מוסד ונושא">
            <button type="button" className="filter-btn" aria-pressed={brand === "all"} onClick={() => setBrand("all")}>
              כל המוסדות
            </button>
            <button type="button" className="filter-btn" aria-pressed={brand === "tb"} onClick={() => setBrand("tb")}>
              קרן טללי ברכה
            </button>
            <button type="button" className="filter-btn" aria-pressed={brand === "bz"} onClick={() => setBrand("bz")}>
              בנות צילה
            </button>
            <label className="visually-hidden" htmlFor="topic">
              נושא
            </label>
            <select id="topic" className="select" style={{ width: "auto", minWidth: 170 }} value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="all">כל הנושאים</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <p className="muted" aria-live="polite">
            {list.length} פריטים
          </p>
          {list.length ? (
            <div className="grid grid--3">
              {list.map((l) => (
                <LessonCard key={l.id} l={l} />
              ))}
            </div>
          ) : (
            <Placeholder title="לא נמצאו תכנים בסינון הזה" />
          )}

          <div style={{ marginTop: 34 }}>
            <Placeholder title="ספריית התכנים תתמלא בשיעורים אמיתיים" todo="data.lessons">
              הסרטונים מוטמעים מיוטיוב (לא מאוחסנים באתר), ואודיו ומאמרים בקישור לספק חיצוני. הפריטים המסומנים "דוגמה" יוחלפו.
            </Placeholder>
          </div>
        </div>
      </section>
    </>
  );
}
