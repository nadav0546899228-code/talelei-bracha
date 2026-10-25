/** עורך תוכן האתר - טקסטים, פרטי קשר, תרומות, מתגים ורשימות (שיעורים, אירועים, פרויקטים, גלריה) */
import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { applyContent, currentContent, type SiteContent } from "../../config/contentModel";
import { api, put } from "../api";

type FieldType = "text" | "textarea" | "url" | "select" | "datetime" | "bool" | "lines";
type FieldDef = { key: string; label: string; type?: FieldType; options?: { v: string; l: string }[]; hint?: string; ltr?: boolean };

const BRAND = [
  { v: "tb", l: "קרן טללי ברכה" },
  { v: "bz", l: "בנות צילה" },
];

const SCHEMAS: Record<"lessons" | "events" | "projects" | "impactStats" | "testimonials" | "galleryAlbums", { label: string; title: (x: Record<string, unknown>) => string; fields: FieldDef[]; blank: () => Record<string, unknown> }> = {
  lessons: {
    label: "שיעורים ותוכן",
    title: (x) => String(x.title || "שיעור חדש"),
    blank: () => ({ id: crypto.randomUUID(), title: "", type: "video", topic: "", speaker: null, brand: "tb", date: null, youtubeId: "", url: "", summary: "" }),
    fields: [
      { key: "title", label: "כותרת" },
      { key: "type", label: "סוג", type: "select", options: [{ v: "video", l: "וידאו" }, { v: "audio", l: "אודיו" }, { v: "article", l: "מאמר" }] },
      { key: "topic", label: "נושא" },
      { key: "speaker", label: "מרצה/ה" },
      { key: "brand", label: "שייך ל", type: "select", options: BRAND },
      { key: "youtubeId", label: "מזהה סרטון ביוטיוב", ltr: true, hint: "החלק שאחרי v= בקישור" },
      { key: "url", label: "קישור לאודיו/מאמר", type: "url" },
      { key: "summary", label: "תקציר", type: "textarea" },
      { key: "demo", label: "פריט דוגמה (יסומן באתר)", type: "bool" },
    ],
  },
  events: {
    label: "אירועים",
    title: (x) => String(x.title || "אירוע חדש"),
    blank: () => ({ id: crypto.randomUUID(), title: "", brand: "tb", start: new Date().toISOString(), location: null, address: null, audience: null, description: null, registrationUrl: null, paymentUrl: null }),
    fields: [
      { key: "title", label: "שם האירוע" },
      { key: "brand", label: "שייך ל", type: "select", options: BRAND },
      { key: "start", label: "תאריך ושעה", type: "datetime" },
      { key: "audience", label: "קהל יעד" },
      { key: "location", label: "שם המקום" },
      { key: "address", label: "כתובת (ל-Waze ומפות)" },
      { key: "registrationUrl", label: "קישור הרשמה", type: "url" },
      { key: "paymentUrl", label: "קישור תשלום מאובטח", type: "url" },
      { key: "description", label: "תיאור", type: "textarea" },
      { key: "demo", label: "פריט דוגמה (יסומן באתר)", type: "bool" },
    ],
  },
  projects: {
    label: "פרויקטים ויעדי תרומה",
    title: (x) => String(x.title || "פרויקט חדש"),
    blank: () => ({ id: crypto.randomUUID(), title: "", description: "", donationUrl: null }),
    fields: [
      { key: "title", label: "שם הפרויקט" },
      { key: "donationUrl", label: "קישור תרומה ייעודי", type: "url", hint: "ריק = קישור התרומה הכללי" },
      { key: "description", label: "תיאור", type: "textarea" },
    ],
  },
  impactStats: {
    label: "השפעה במספרים",
    title: (x) => `${x.value || "-"} ${x.label || ""}`,
    blank: () => ({ value: "", label: "" }),
    fields: [
      { key: "value", label: "מספר", hint: "רק נתון שנמסר ואושר על ידי המוסדות" },
      { key: "label", label: "תיאור" },
    ],
  },
  testimonials: {
    label: "עדויות",
    title: (x) => String(x.attribution || "עדות"),
    blank: () => ({ text: "", attribution: "" }),
    fields: [
      { key: "text", label: "נוסח העדות", type: "textarea", hint: "רק באישור, וללא פרטים מזהים" },
      { key: "attribution", label: "שיוך (למשל: משתתפת, בעילום שם)" },
    ],
  },
  galleryAlbums: {
    label: "גלריה",
    title: (x) => String(x.title || "אלבום חדש"),
    blank: () => ({ id: crypto.randomUUID(), title: "", brand: "tb", category: "", approved: true, images: [] }),
    fields: [
      { key: "title", label: "שם האלבום" },
      { key: "category", label: "תחום" },
      { key: "brand", label: "שייך ל", type: "select", options: BRAND },
      { key: "images", label: "קישורי תמונות (שורה לכל תמונה: קישור | תיאור)", type: "lines", hint: "רק תמונות שאושרו לפרסום. מומלץ WebP מכווץ." },
      { key: "approved", label: "יש אישור פרסום מהמצולמים/המוסד", type: "bool" },
      { key: "demo", label: "אלבום דוגמה", type: "bool" },
    ],
  },
};

type Section = "texts" | "contact" | "donation" | "features" | keyof typeof SCHEMAS;

const SECTIONS: { k: Section; l: string }[] = [
  { k: "texts", l: "טקסטים" },
  { k: "contact", l: "פרטי קשר" },
  { k: "donation", l: "תרומות" },
  { k: "features", l: "הגדרות תצוגה" },
  { k: "lessons", l: "שיעורים" },
  { k: "events", l: "אירועים" },
  { k: "projects", l: "פרויקטים" },
  { k: "galleryAlbums", l: "גלריה" },
  { k: "impactStats", l: "מספרים" },
  { k: "testimonials", l: "עדויות" },
];

/* ---------- שדה בודד ---------- */
function Field({ def, value, onChange }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const t = def.type ?? "text";
  if (t === "bool") {
    return (
      <label className="adm-toggle span-2">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {def.label}
      </label>
    );
  }
  const common = { className: t === "select" ? "select" : t === "textarea" || t === "lines" ? "textarea" : "input" };
  const str = (v: unknown) => (v == null ? "" : String(v));
  return (
    <label className={`field ${t === "textarea" || t === "lines" ? "span-2" : ""}`}>
      <span className="field__label">{def.label}</span>
      {t === "select" ? (
        <select {...common} value={str(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options?.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      ) : t === "textarea" ? (
        <textarea {...common} value={str(value)} onChange={(e) => onChange(e.target.value || null)} />
      ) : t === "lines" ? (
        <textarea
          {...common}
          dir="ltr"
          style={{ textAlign: "right" }}
          value={(Array.isArray(value) ? value : [])
            .map((i: { src?: string | null; alt?: string }) => (i.src ? `${i.src} | ${i.alt ?? ""}` : ""))
            .filter(Boolean)
            .join("\n")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l, i) => {
                  const [src, alt] = l.split("|").map((s) => s.trim());
                  return { id: `img-${i}`, src, alt: alt || "תמונה מהפעילות", width: 4, height: 3 };
                }),
            )
          }
        />
      ) : t === "datetime" ? (
        <input
          {...common}
          type="datetime-local"
          value={value ? toLocal(String(value)) : ""}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        />
      ) : (
        <input
          {...common}
          type={t === "url" ? "url" : "text"}
          dir={t === "url" || def.ltr ? "ltr" : undefined}
          style={t === "url" || def.ltr ? { textAlign: "right" } : undefined}
          value={str(value)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
      {def.hint ? <span className="field__hint">{def.hint}</span> : null}
    </label>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- עורך רשימה ---------- */
function ListEditor({ k, items, onChange }: { k: keyof typeof SCHEMAS; items: Record<string, unknown>[]; onChange: (v: Record<string, unknown>[]) => void }) {
  const schema = SCHEMAS[k];
  const [open, setOpen] = useState<number | null>(null);
  const set = (i: number, key: string, v: unknown) => onChange(items.map((it, j) => (j === i ? { ...it, [key]: v } : it)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
    setOpen(open === i ? i + d : open);
  };
  return (
    <div className="adm-fields">
      {items.map((it, i) => (
        <div className="adm-item" key={String(it.id ?? i)}>
          <div className="adm-item__head">
            <button type="button" className="text-link" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ink)", minWidth: 0 }} onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <strong>{schema.title(it)}</strong>
              {it.demo ? <span className="flag">דוגמה</span> : null}
            </button>
            <div className="adm-item__actions">
              <button type="button" className="adm-icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="העברה למעלה">
                <Icon name="arrowUp" />
              </button>
              <button type="button" className="adm-icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="העברה למטה">
                <Icon name="arrowDown" />
              </button>
              <button
                type="button"
                className="adm-icon-btn adm-icon-btn--danger"
                onClick={() => window.confirm("להסיר את הפריט?") && onChange(items.filter((_, j) => j !== i))}
                aria-label="הסרה"
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
          {open === i ? (
            <div className="adm-fields adm-fields--2">
              {schema.fields.map((f) => (
                <Field key={f.key} def={f} value={it[f.key]} onChange={(v) => set(i, f.key, v)} />
              ))}
            </div>
          ) : null}
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            onChange([...items, schema.blank()]);
            setOpen(items.length);
          }}
        >
          <Icon name="plus" />
          הוספה
        </button>
      </div>
    </div>
  );
}

/* ---------- התצוגה ---------- */
export function ContentView({ initialSection }: { initialSection?: string } = {}) {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [section, setSection] = useState<Section>((initialSection as Section) || "texts");
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ content: Partial<SiteContent> | null }>("/api/admin/content")
      .then((r) => {
        applyContent(r.content);
        setContent(currentContent());
      })
      .catch(() => setContent(currentContent()));
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!content) return <p className="muted">טוען…</p>;

  const patchGroup = <G extends "texts" | "contact" | "donation" | "features" | "social">(g: G, key: string, v: unknown) => {
    setContent({ ...content, [g]: { ...content[g], [key]: v } });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await put("/api/admin/content", { content, section });
      applyContent(content);
      setDirty(false);
      setMsg({ ok: true, text: "נשמר. השינויים מופיעים באתר בטעינה הבאה של העמוד." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה בשמירה" });
    } finally {
      setSaving(false);
    }
  };

  const groupFields: Record<"texts" | "contact" | "donation" | "features", FieldDef[]> = {
    texts: [
      { key: "vision", label: "משפט חזון (דף הבית ואודות)", type: "textarea" },
      { key: "aboutTaleiBracha", label: "על קרן טללי ברכה", type: "textarea" },
      { key: "aboutBnotTzila", label: "על בנות צילה", type: "textarea" },
      { key: "story", label: "הסיפור שלנו (עמוד אודות)", type: "textarea" },
      { key: "bnotTzilaTagline", label: "משפט פתיחה לבנות צילה" },
    ],
    contact: [
      { key: "phone", label: "טלפון", ltr: true },
      { key: "whatsapp", label: "וואטסאפ (בפורמט 9725XXXXXXXX)", ltr: true },
      { key: "whatsappMessage", label: "נוסח הודעת פתיחה בוואטסאפ", hint: "כפתור הוואטסאפ הצף יופיע רק כשיש מספר ונוסח" },
      { key: "email", label: "מייל", ltr: true },
      { key: "address", label: "כתובת" },
      { key: "hours", label: "שעות מענה" },
    ],
    donation: [
      { key: "generalUrl", label: "קישור לעמוד התרומה (סליקה מאובטחת)", type: "url" },
      { key: "providerName", label: "שם ספק הסליקה" },
      { key: "supportsMonthly", label: "הספק תומך בהוראת קבע חודשית", type: "bool" },
      { key: "section46", label: "יש למוסדות אישור סעיף 46 בתוקף", type: "bool" },
    ],
    features: [
      { key: "showContentFlags", label: 'הצגת תגיות "טיוטה/דוגמה" ומשבצות תוכן חסר (לכבות לפני פרסום סופי)', type: "bool" },
      { key: "floatingWhatsapp", label: "כפתור וואטסאפ צף", type: "bool" },
      { key: "assistanceForm", label: "טופס בקשת סיוע בעמוד הקרן", type: "bool" },
      { key: "donationDedication", label: "הצגת אפשרות הקדשה בתרומה", type: "bool" },
    ],
  };

  const isGroup = (s: Section): s is "texts" | "contact" | "donation" | "features" => s in groupFields;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>תוכן האתר</h1>
        </div>
        <a className="btn btn--ghost btn--sm" href="/" target="_blank" rel="noopener noreferrer">
          <Icon name="eye" />
          צפייה באתר
        </a>
      </div>

      <div className="adm-sections" role="group" aria-label="חלקי התוכן">
        {SECTIONS.map((s) => (
          <button key={s.k} type="button" className="adm-chip" aria-pressed={section === s.k} onClick={() => setSection(s.k)}>
            {s.l}
          </button>
        ))}
      </div>

      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>{SECTIONS.find((s) => s.k === section)?.l}</h2>
        </div>
        {isGroup(section) ? (
          <div className="adm-fields adm-fields--2">
            {groupFields[section].map((f) => (
              <Field
                key={f.key}
                def={f}
                value={(content[section] as Record<string, unknown>)[f.key]}
                onChange={(v) => patchGroup(section, f.key, f.type === "bool" ? Boolean(v) : v)}
              />
            ))}
            {section === "contact"
              ? (["youtube", "facebook", "instagram"] as const).map((k) => (
                  <Field key={k} def={{ key: k, label: k === "youtube" ? "ערוץ יוטיוב" : k === "facebook" ? "פייסבוק" : "אינסטגרם", type: "url" }} value={content.social[k]} onChange={(v) => patchGroup("social", k, v)} />
                ))
              : null}
          </div>
        ) : (
          <ListEditor
            k={section}
            items={content[section] as unknown as Record<string, unknown>[]}
            onChange={(v) => {
              setContent({ ...content, [section]: v });
              setDirty(true);
            }}
          />
        )}
      </section>

      <div className="adm-savebar">
        <span>{dirty ? "יש שינויים שלא נשמרו" : msg?.text ?? "כל השינויים שמורים"}</span>
        <button type="button" className="btn btn--flame btn--sm" disabled={!dirty || saving} onClick={save}>
          {saving ? "שומר…" : "שמירה"}
        </button>
      </div>
      {msg && !msg.ok ? (
        <div className="adm-alert adm-alert--error" role="alert">
          {msg.text}
        </div>
      ) : null}
    </>
  );
}
