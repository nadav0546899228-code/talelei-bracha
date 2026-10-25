/** הרשמה לאירוע (הפרשת חלה) - נפתח מקישור בוואטסאפ */
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { PageHero } from "../components/ui";

type Ev = { title: string; date: string; time: string; place: string; branch: string; city: string; full: boolean };

export default function Register() {
  const id = new URLSearchParams(window.location.search).get("e") || "";
  const [ev, setEv] = useState<Ev | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/public/challah/${encodeURIComponent(id)}`)
      .then(async (r) => ((await r.json()) as Ev & { error?: string }))
      .then((j) => (j.error ? setErr(j.error) : setEv(j)))
      .catch(() => setErr("לא ניתן לטעון את האירוע"));
  }, [id]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/public/challah/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "שגיאה");
      setDone(true);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "שגיאה");
    }
    setBusy(false);
  };
  const when = ev ? new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${ev.date}T12:00:00`)) : "";
  return (
    <>
      <PageHero title={ev?.title || "הרשמה לאירוע"} lead={ev ? `${when}${ev.time ? ` · ${ev.time}` : ""}${ev.place ? ` · ${ev.place}` : ""}` : ""} />
      <section className="section">
        <div className="container" style={{ maxWidth: 520 }}>
          {err ? <div className="form-status form-status--error">{err}</div> : null}
          {done ? (
            <div className="card" style={{ textAlign: "center" }}>
              <Icon name="checkCircle" width={48} height={48} style={{ color: "var(--teal)" }} />
              <h2>נרשמת בהצלחה!</h2>
              <p className="muted">נשלח תזכורת יום לפני. מחכות לך.</p>
            </div>
          ) : ev ? (
            ev.full ? (
              <div className="card">האירוע מלא. אפשר לפנות אלינו בדף צור קשר.</div>
            ) : (
              <form className="card" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
                <label className="field">
                  <span className="field__label">שם מלא</span>
                  <input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </label>
                <label className="field">
                  <span className="field__label">טלפון</span>
                  <input className="input" required type="tel" inputMode="tel" dir="ltr" style={{ textAlign: "right" }} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                </label>
                <button type="submit" className="btn btn--rose" disabled={busy}>
                  {busy ? "נרשמת…" : "אני מגיעה"}
                </button>
                <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                  {[ev.branch, ev.city].filter(Boolean).join(", ")} · הפרטים משמשים רק לתזכורת ולקשר.
                </p>
              </form>
            )
          ) : !err ? (
            <div className="spinner" aria-label="טוען" />
          ) : null}
        </div>
      </section>
    </>
  );
}
