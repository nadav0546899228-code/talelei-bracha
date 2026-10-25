/** כפתורים צפים: וואטסאפ (רק עם מספר מאושר) ותפריט נגישות */
import { useEffect, useState } from "react";
import { site } from "../config/site";
import { Link } from "../router/Router";
import { Icon } from "./Icon";

type A11yState = {
  font: 0 | 1 | 2;
  contrast: boolean;
  links: boolean;
  readable: boolean;
  noMotion: boolean;
};

const DEFAULTS: A11yState = { font: 0, contrast: false, links: false, readable: false, noMotion: false };
const KEY = "tb-a11y";

function load(): A11yState {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function apply(s: A11yState) {
  const h = document.documentElement.classList;
  h.toggle("a11y-font-1", s.font === 1);
  h.toggle("a11y-font-2", s.font === 2);
  h.toggle("a11y-contrast", s.contrast);
  h.toggle("a11y-links", s.links);
  h.toggle("a11y-readable", s.readable);
  h.toggle("a11y-no-motion", s.noMotion);
}

export function FloatingButtons() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<A11yState>(DEFAULTS);

  useEffect(() => {
    const s = load();
    setState(s);
    apply(s);
  }, []);

  useEffect(() => {
    apply(state);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* אחסון לא זמין - ההגדרות יחולו רק בביקור הנוכחי */
    }
  }, [state]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const wa = site.contact.whatsapp;
  const showWa = site.features.floatingWhatsapp && wa && site.contact.whatsappMessage;

  const toggle = (k: keyof Omit<A11yState, "font">) => setState((s) => ({ ...s, [k]: !s[k] }));

  return (
    <>
      {open ? (
        <div className="a11y-panel" role="dialog" aria-label="הגדרות נגישות">
          <h2>הגדרות נגישות</h2>
          <div className="a11y-panel__grid">
            <button
              type="button"
              className="a11y-opt"
              aria-pressed={state.font > 0}
              onClick={() => setState((s) => ({ ...s, font: ((s.font + 1) % 3) as 0 | 1 | 2 }))}
            >
              הגדלת טקסט {state.font > 0 ? `(${state.font})` : ""}
            </button>
            <button type="button" className="a11y-opt" aria-pressed={state.contrast} onClick={() => toggle("contrast")}>
              ניגודיות גבוהה
            </button>
            <button type="button" className="a11y-opt" aria-pressed={state.links} onClick={() => toggle("links")}>
              הדגשת קישורים
            </button>
            <button type="button" className="a11y-opt" aria-pressed={state.readable} onClick={() => toggle("readable")}>
              גופן קריא
            </button>
            <button type="button" className="a11y-opt" aria-pressed={state.noMotion} onClick={() => toggle("noMotion")}>
              עצירת אנימציות
            </button>
            <button type="button" className="a11y-opt" onClick={() => setState(DEFAULTS)}>
              איפוס
            </button>
          </div>
          <div className="a11y-panel__foot">
            <Link to="/accessibility" onClick={() => setOpen(false)}>
              הצהרת נגישות
            </Link>
            <button type="button" className="text-link" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--teal)" }} onClick={() => setOpen(false)}>
              סגירה
            </button>
          </div>
        </div>
      ) : null}

      <div className="float-stack">
        {showWa ? (
          <a
            className="float-btn float-btn--wa"
            href={`https://wa.me/${wa}?text=${encodeURIComponent(site.contact.whatsappMessage ?? "")}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="שליחת הודעת וואטסאפ"
          >
            <Icon name="whatsapp" />
          </a>
        ) : null}
        <button
          type="button"
          className="float-btn float-btn--a11y"
          aria-label="תפריט נגישות"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="a11y" />
        </button>
      </div>
    </>
  );
}
