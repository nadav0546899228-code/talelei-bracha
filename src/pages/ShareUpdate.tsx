import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Logo } from "../components/Logo";

type Info = { name: string; domain: "kollel" | "bnot"; branch: string; city: string; pending: number };

async function resizeImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("ניתן לצרף תמונות בלבד");
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("לא ניתן לקרוא את התמונה"));
      el.src = src;
    });
    const max = 1600;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("לא ניתן לעבד את התמונה");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } finally {
    URL.revokeObjectURL(src);
  }
}

export default function ShareUpdate() {
  const token = new URLSearchParams(window.location.search).get("t") || "";
  const [info, setInfo] = useState<Info | null>(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "sending" | "done" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("הקישור אינו תקין");
      return;
    }
    fetch(`/api/public/mitch-share?t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "הקישור אינו פעיל");
        setInfo(data);
        setState("ready");
      })
      .catch((e) => {
        setMessage(e instanceof Error ? e.message : "הקישור אינו פעיל");
        setState("error");
      });
  }, [token]);

  const choose = async (files: FileList | null) => {
    if (!files?.length) return;
    setMessage("");
    try {
      const next = [...photos];
      for (const file of Array.from(files).slice(0, Math.max(0, 4 - next.length))) next.push(await resizeImage(file));
      setPhotos(next.slice(0, 4));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "לא ניתן לצרף את התמונה");
    }
  };

  const send = async () => {
    if (!text.trim() && !photos.length) {
      setMessage("יש לכתוב עדכון או לצרף תמונה");
      return;
    }
    setState("sending");
    setMessage("");
    try {
      const r = await fetch("/api/public/mitch-share", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token, text, photos }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "השליחה נכשלה");
      setText("");
      setPhotos([]);
      setMessage(data.message || "העדכון נשלח לאישור");
      setState("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "השליחה נכשלה");
      setState("ready");
    }
  };

  return (
    <main className={`mitch-share ${info?.domain === "bnot" ? "mitch-share--bnot" : ""}`}>
      <section className="mitch-share__card">
        <header className="mitch-share__head">
          <div className="mitch-share__logos">
            <Logo org="taleiBracha" height={54} priority />
            <Logo org="bnotTzila" height={54} priority />
          </div>
          {info ? (
            <>
              <span className="mitch-share__hello">שלום {info.name}</span>
              <h1>העדכון האישי שלי</h1>
              <p>{[info.branch, info.city].filter(Boolean).join(" · ")}</p>
            </>
          ) : (
            <h1>העדכון האישי שלי</h1>
          )}
        </header>

        {state === "loading" ? <div className="mitch-share__state"><span className="spinner" /> בודק את הקישור…</div> : null}
        {state === "error" ? (
          <div className="mitch-share__error"><Icon name="alert" /><strong>{message}</strong><span>אפשר לבקש קישור אישי חדש מהרכז/ת.</span></div>
        ) : null}

        {info && state !== "error" ? (
          <div className="mitch-share__body">
            {state === "done" ? (
              <div className="mitch-share__success">
                <Icon name="checkCircle" />
                <strong>{message}</strong>
                <span>הרכז/ת המקומי/ת יעבור על העדכון לפני שהוא נכנס למערכת.</span>
                <button type="button" className="btn" onClick={() => { setState("ready"); setMessage(""); }}>שליחת עדכון נוסף</button>
              </div>
            ) : (
              <>
                <label className="field">
                  <span className="field__label">מה רציתי לשתף?</span>
                  <textarea
                    className="textarea mitch-share__text"
                    maxLength={4000}
                    placeholder="אפשר לכתוב חוויה, התקדמות, שאלה או משהו שחשוב שהרכז/ת יידעו…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <span className="field__hint">{text.length}/4000</span>
                </label>

                <div className="mitch-share__photos">
                  <div className="mitch-share__photos-head">
                    <strong>תמונות</strong>
                    <span>עד 4 תמונות · בלי הקלטות</span>
                  </div>
                  {photos.length ? (
                    <div className="mitch-share__grid">
                      {photos.map((src, i) => (
                        <div key={i} className="mitch-share__photo">
                          <img src={src} alt={`תמונה ${i + 1}`} />
                          <button type="button" aria-label="הסרת תמונה" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}><Icon name="close" /></button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {photos.length < 4 ? (
                    <label className="mitch-share__add-photo">
                      <Icon name="image" />
                      <span>בחירת תמונות</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple onChange={(e) => choose(e.target.files)} />
                    </label>
                  ) : null}
                </div>

                {message ? <div className="mitch-share__notice">{message}</div> : null}
                {info.pending ? <div className="mitch-share__pending"><Icon name="clock" /> יש לך {info.pending} עדכונים שממתינים לאישור.</div> : null}

                <button type="button" className="btn btn--block mitch-share__send" disabled={state === "sending" || (!text.trim() && !photos.length)} onClick={send}>
                  <Icon name="share" />
                  {state === "sending" ? "שולח…" : "שליחת העדכון לאישור"}
                </button>
                <p className="mitch-share__privacy">העדכון נשלח לצוות המקומי האחראי. רק לאחר אישור הוא יצורף למעקב במערכת.</p>
              </>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
