/**
 * חלון קלט מסודר במקום window.prompt (שלא נוח בטלפון ולא מאפשר בחירה מרשימה או לוח שנה).
 * שימוש: const v = await ask({ title: "...", kind: "date" }); // null אם בוטל
 */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

type AskOptions = {
  title: string;
  label?: string;
  initial?: string;
  kind?: "text" | "textarea" | "date" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  okLabel?: string;
  /** מחזיר הודעת שגיאה אם הערך לא תקין */
  validate?: (v: string) => string | null;
  danger?: boolean;
};

export function ask(opts: AskOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: string | null) => {
      resolve(v);
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    root.render(<AskDialog {...opts} onDone={done} />);
  });
}

function AskDialog({ title, label, initial = "", kind = "text", options, placeholder, okLabel = "אישור", validate, danger, onDone }: AskOptions & { onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial || (kind === "select" ? options?.[0]?.value ?? "" : ""));
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);
  const submit = () => {
    const e = validate?.(v) ?? null;
    if (e) return setErr(e);
    onDone(v);
  };
  return (
    <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onDone(null)}>
      <form
        className="adm-modal"
        dir="rtl"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2>{title}</h2>
        <label className="field" style={{ display: "block", marginTop: 8 }}>
          {label ? <span className="field__label">{label}</span> : null}
          {kind === "textarea" ? (
            <textarea ref={ref} className="input" rows={4} value={v} placeholder={placeholder} onChange={(e) => (setV(e.target.value), setErr(null))} />
          ) : kind === "select" ? (
            <select ref={ref} className="input" value={v} onChange={(e) => (setV(e.target.value), setErr(null))}>
              {(options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input ref={ref} className="input" type={kind === "date" ? "date" : "text"} value={v} placeholder={placeholder} onChange={(e) => (setV(e.target.value), setErr(null))} />
          )}
        </label>
        {err ? (
          <p className="adm-alert adm-alert--error" style={{ marginTop: 8 }}>
            {err}
          </p>
        ) : null}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="submit" className={`btn btn--sm${danger ? " btn--danger" : ""}`}>
            {okLabel}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDone(null)}>
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
