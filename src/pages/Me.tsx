/** הדף האישי של מתחזק/ת - נפתח מקישור בוואטסאפ. שיתוף טקסט ותמונות שמגיע לאישור הרכז/ת */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";

type Item = { id: string; text: string; images: string[]; status: "pending" | "approved"; createdAt: string };
type Data = { name: string; domain: "kollel" | "bnot"; branch: string; shares: Item[] };
type Pic = { type: string; data: string; url: string };

/** הקטנת תמונה לפני שליחה (עד 1400 פיקסלים, JPEG) */
function shrink(file: File): Promise<Pic> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1400;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      const url = c.toDataURL("image/jpeg", 0.82);
      resolve({ type: "image/jpeg", data: url.split(",")[1], url });
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("לא הצלחנו לקרוא את התמונה"));
    };
    img.src = src;
  });
}

const when = (iso: string) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export default function Me() {
  const t = new URLSearchParams(window.location.search).get("t") || "";
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pics, setPics] = useState<Pic[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch(`/api/public/me?t=${encodeURIComponent(t)}`)
      .then(async (r) => (await r.json()) as Data & { error?: string })
      .then((j) => (j.error ? setErr(j.error) : setD(j)))
      .catch(() => setErr("אין חיבור. אפשר לנסות שוב."));
  }, [t]);
  useEffect(() => {
    document.title = "השיתוף שלי";
    load();
  }, [load]);

  const add = async (files: FileList | null) => {
    if (!files) return;
    const room = 4 - pics.length;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
    try {
      const out = await Promise.all(list.map(shrink));
      setPics((p) => [...p, ...out].slice(0, 4));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/public/me?t=${encodeURIComponent(t)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, images: pics.map(({ type, data }) => ({ type, data })) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "שגיאה");
      setText("");
      setPics([]);
      setSent(true);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
    setBusy(false);
  };

  const girl = d?.domain === "bnot";
  return (
    <div className={`me ${girl ? "me--bnot" : "me--kollel"}`} dir="rtl">
      <header className="me__head">
        <img src={girl ? "/brand/logo-bnot-tzila.webp" : "/brand/logo-keren-talelei-bracha.webp"} alt="" className="me__logo" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        <div>
          <h1>{d ? `שלום ${d.name}` : "השיתוף שלי"}</h1>
          {d ? <p>{girl ? "בנות צילה" : "טללי ברכה · כולל ערב"}{d.branch ? ` · ${d.branch}` : ""}</p> : null}
        </div>
      </header>

      <main className="me__main">
        {err ? <div className="me__err">{err}</div> : null}
        {!d && !err ? <div className="spinner" aria-label="טוען" /> : null}

        {d ? (
          <>
            {sent ? (
              <div className="me__ok">
                <Icon name="checkCircle" width={40} height={40} />
                <div>
                  <strong>נשלח, תודה!</strong>
                  <span>{girl ? "הרכזת" : "הרכז"} יראו את זה בקרוב</span>
                </div>
                <button type="button" className="me__link" onClick={() => setSent(false)}>
                  שיתוף נוסף
                </button>
              </div>
            ) : (
              <section className="me__card">
                <h2>מה תרצ{girl ? "י" : "ה"} לשתף?</h2>
                <textarea
                  className="me__text"
                  placeholder={girl ? "מה למדתי, רגע מיוחד, הפרשת חלה בבית…" : "מה למדנו, רגע מיוחד, משהו שהתחזקתי בו…"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={3000}
                />
                {pics.length ? (
                  <div className="me__pics">
                    {pics.map((p, i) => (
                      <div key={i} className="me__pic">
                        <img src={p.url} alt="" />
                        <button type="button" aria-label="הסרת תמונה" onClick={() => setPics(pics.filter((_, j) => j !== i))}>
                          <Icon name="close" width={16} height={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="me__btns">
                  <button type="button" className="me__big" disabled={pics.length >= 4} onClick={() => camRef.current?.click()}>
                    <Icon name="image" width={26} height={26} />
                    <span>צילום</span>
                  </button>
                  <button type="button" className="me__big" disabled={pics.length >= 4} onClick={() => fileRef.current?.click()}>
                    <Icon name="plus" width={26} height={26} />
                    <span>תמונה מהגלריה</span>
                  </button>
                </div>
                <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
                <button type="button" className="me__send" disabled={busy || (!text.trim() && !pics.length)} onClick={send}>
                  <Icon name="share" width={20} height={20} /> {busy ? "שולח…" : "שליחה"}
                </button>
                <p className="me__note">
                  <Icon name="lock" width={14} height={14} /> נשלח רק {girl ? "לרכזת" : "לרכז"} שלך. עד 4 תמונות.
                </p>
              </section>
            )}

            {d.shares.length ? (
              <section className="me__hist">
                <h2>מה ששלחתי</h2>
                {d.shares.map((s) => (
                  <article key={s.id} className="me__item">
                    <div className="me__item-top">
                      <span>{when(s.createdAt)}</span>
                      <span className={`me__st ${s.status === "approved" ? "is-ok" : ""}`}>
                        <Icon name={s.status === "approved" ? "checkCircle" : "clock"} width={14} height={14} /> {s.status === "approved" ? "אושר" : "ממתין"}
                      </span>
                    </div>
                    {s.text ? <p>{s.text}</p> : null}
                    {s.images.length ? (
                      <div className="me__pics me__pics--sm">
                        {s.images.map((f) => (
                          <img key={f} src={`/api/public/me/file/${f}?t=${encodeURIComponent(t)}`} alt="" loading="lazy" />
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
