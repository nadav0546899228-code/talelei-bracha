/** אירועי הפרשת חלה: הרשמה (קישור לשיתוף), אישור הגעה, תיעוד והעברה למעקב מתחזקות */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, post, type OrgUnit } from "../api";
import { Chips, Combo, ExportBtn, Fab, waLink } from "../components";
import { useLive } from "../live";
import { buildXlsx, downloadBlob } from "../xlsx";

type Reg = { id: string; name: string; phone: string; arrived: boolean; at: string; mitchId: string | null };
type Ev = { id: string; title: string; date: string; time: string; place: string; branchId: string; capacity: number; notes: string; summary: string; open: boolean; registrations: Reg[]; reminderSent?: boolean };
type Data = { events: Ev[]; branches: OrgUnit[]; cities: OrgUnit[] };

const dayLabel = (iso: string) => new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "numeric" }).format(new Date(`${iso}T12:00:00`));
const todayIso = () => new Date().toISOString().slice(0, 10);

export function ChallahPanel() {
  const [d, setD] = useState<Data | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Ev> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => api<Data>("/api/challah").then((r) => (setD(r), setOpenId((id) => id ?? r.events[0]?.id ?? null))).catch((e) => setMsg({ ok: false, text: e.message })), []);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["challahEvents"], load);

  if (!d) return <p className="muted">טוען…</p>;
  if (!d.branches.length) return <div className="adm-panel adm-empty">אין סניפים באחריותך.</div>;
  const ev = d.events.find((e) => e.id === openId) ?? null;
  const bName = (id: string) => d.branches.find((b) => b.id === id)?.name ?? "";

  const saveEv = async (x: Partial<Ev>) => {
    setMsg(null);
    try {
      const r = await post<{ id: string }>("/api/challah", x);
      setOpenId(r.id);
      await load();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
      return false;
    }
  };
  const link = (id: string) => `${window.location.origin}/register?e=${id}`;

  return (
    <>
      {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`}>{msg.text}</div> : null}
      {d.events.length ? (
        <Chips<string>
          value={openId ?? ""}
          onChange={setOpenId}
          items={d.events.slice(0, 30).map((e) => ({ id: e.id, label: `${dayLabel(e.date)} · ${e.title}`, count: e.registrations.length }))}
        />
      ) : null}

      {form ? (
        <section className="adm-panel">
          <h2>{form.id ? "עריכת אירוע" : "אירוע חדש"}</h2>
          <div className="adm-fields adm-fields--2">
            <label className="field span-2">
              <span className="field__label">שם האירוע</span>
              <input className="input" value={form.title ?? ""} placeholder="הפרשת חלה" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">תאריך</span>
              <input className="input" type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">שעה</span>
              <input className="input" type="time" value={form.time ?? ""} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </label>
            <label className="field span-2">
              <span className="field__label">מקום</span>
              <input className="input" value={form.place ?? ""} onChange={(e) => setForm({ ...form, place: e.target.value })} />
            </label>
            <div className="field">
              <span className="field__label">סניף</span>
              <Combo label="סניף" value={form.branchId ?? ""} onChange={(branchId) => setForm({ ...form, branchId })} options={d.branches.map((b) => ({ id: b.id, label: b.name, sub: d.cities.find((c) => c.id === b.parentId)?.name }))} />
            </div>
            <label className="field">
              <span className="field__label">מקומות (0 = ללא הגבלה)</span>
              <input className="input" type="number" value={form.capacity ?? 0} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn--sm" disabled={!form.date || !form.branchId} onClick={async () => (await saveEv(form)) && setForm(null)}>
              <Icon name="check" /> שמירה
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm(null)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}

      {ev && !form ? <EventCard ev={ev} bName={bName} link={link(ev.id)} onSave={saveEv} onEdit={() => setForm(ev)} reload={load} setMsg={setMsg} /> : null}
      {!d.events.length && !form ? <div className="adm-panel adm-empty">עדיין אין אירועים. לוחצים + ליצירת אירוע הפרשת חלה.</div> : null}
      {!form ? <Fab label="אירוע חדש" onClick={() => setForm({ title: "הפרשת חלה", date: todayIso(), time: "20:00", place: "", branchId: d.branches.length === 1 ? d.branches[0].id : "", capacity: 0 })} /> : null}
    </>
  );
}

function EventCard({ ev, bName, link, onSave, onEdit, reload, setMsg }: { ev: Ev; bName: (id: string) => string; link: string; onSave: (x: Partial<Ev>) => Promise<boolean>; onEdit: () => void; reload: () => void; setMsg: (m: { ok: boolean; text: string } | null) => void }) {
  const [add, setAdd] = useState({ name: "", phone: "" });
  const [summary, setSummary] = useState(ev.summary);
  useEffect(() => setSummary(ev.summary), [ev.id, ev.summary]);
  const arrived = ev.registrations.filter((r) => r.arrived).length;
  const setRegs = (registrations: Reg[]) => onSave({ ...ev, registrations });
  const shareText = `נשמח לראותך ב${ev.title} - ${dayLabel(ev.date)}${ev.time ? ` ${ev.time}` : ""}${ev.place ? `, ${ev.place}` : ""}.\nלהרשמה: ${link}`;
  const exportXlsx = () => {
    const rows = [["שם", "טלפון", "הגיעה", "נרשמה"], ...ev.registrations.map((r) => [r.name, r.phone, r.arrived ? "כן" : "לא", r.at.slice(0, 10)])];
    downloadBlob(buildXlsx([{ name: "נרשמות", rows, widths: [22, 14, 8, 12] }]), `${ev.title} ${ev.date}.xlsx`);
  };
  return (
    <>
      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>
            {ev.title} · {dayLabel(ev.date)}
            {ev.time ? ` ${ev.time}` : ""}
          </h2>
          <span className="adm-item__actions">
            <button type="button" className="adm-icon-btn" aria-label="עריכה" onClick={onEdit}>
              <Icon name="edit" />
            </button>
            <button
              type="button"
              className="adm-icon-btn adm-icon-btn--danger"
              aria-label="מחיקה"
              onClick={async () => {
                if (!window.confirm("למחוק את האירוע?")) return;
                await del(`/api/challah/${ev.id}`);
                reload();
              }}
            >
              <Icon name="trash" />
            </button>
          </span>
        </div>
        <p className="muted" style={{ marginTop: -6 }}>
          {[ev.place, bName(ev.branchId)].filter(Boolean).join(" · ")} · נרשמו {ev.registrations.length}
          {ev.capacity ? `/${ev.capacity}` : ""} · הגיעו {arrived}
          {ev.reminderSent ? " · תזכורת נשלחה" : ""}
        </p>
        <div className="adm-tiles adm-tiles--small" style={{ marginBottom: 6 }}>
          <a className="adm-tile" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">
            <span className="adm-tile__icon">
              <Icon name="whatsapp" />
            </span>
            <span className="adm-tile__l">שיתוף בוואטסאפ</span>
          </a>
          <button type="button" className="adm-tile" onClick={() => navigator.clipboard?.writeText(link).then(() => setMsg({ ok: true, text: "קישור ההרשמה הועתק" }))}>
            <span className="adm-tile__icon">
              <Icon name="share" />
            </span>
            <span className="adm-tile__l">העתקת קישור</span>
          </button>
          <button type="button" className="adm-tile" onClick={() => onSave({ ...ev, open: !ev.open })}>
            <span className="adm-tile__icon">
              <Icon name="lock" />
            </span>
            <span className="adm-tile__l">{ev.open ? "סגירת הרשמה" : "פתיחת הרשמה"}</span>
          </button>
        </div>
      </section>

      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>
            נרשמות <span className="muted">({ev.registrations.length})</span>
          </h2>
          <span className="adm-item__actions">
            <ExportBtn onClick={exportXlsx} />
          </span>
        </div>
        <div className="adm-att">
          {ev.registrations.map((r) => (
            <div key={r.id} className={`adm-att__btn${r.arrived ? " is-on" : ""}`} style={{ cursor: "default" }}>
              <button type="button" className="adm-att__mark" style={{ border: 0, cursor: "pointer" }} aria-label={`${r.name} הגיעה`} aria-pressed={r.arrived} onClick={() => setRegs(ev.registrations.map((x) => (x.id === r.id ? { ...x, arrived: !x.arrived } : x)))}>
                <Icon name={r.arrived ? "check" : "close"} />
              </button>
              <span className="adm-att__name">
                {r.name}
                {r.mitchId ? <small className="muted" style={{ display: "block", fontWeight: 500 }}>במעקב</small> : null}
              </span>
              {r.phone ? (
                <a className="adm-ia adm-ia--wa" style={{ width: 32, height: 32 }} href={waLink(r.phone, `שלום ${r.name}, `)} target="_blank" rel="noopener noreferrer" aria-label="וואטסאפ">
                  <Icon name="whatsapp" />
                </a>
              ) : (
                <small />
              )}
            </div>
          ))}
        </div>
        <div className="adm-toolbar" style={{ marginTop: 10 }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="שם" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <input className="input" style={{ flex: 1, minWidth: 0 }} type="tel" dir="ltr" placeholder="טלפון" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} />
          <button
            type="button"
            className="adm-icon-btn adm-icon-btn--ok"
            aria-label="הוספת נרשמת"
            disabled={!add.name.trim()}
            onClick={async () => {
              if (await setRegs([...ev.registrations, { id: Math.random().toString(36).slice(2, 10), name: add.name, phone: add.phone, arrived: true, at: new Date().toISOString(), mitchId: null }])) setAdd({ name: "", phone: "" });
            }}
          >
            <Icon name="plus" />
          </button>
        </div>
        {arrived ? (
          <button
            type="button"
            className="btn btn--sm"
            style={{ marginTop: 10 }}
            onClick={async () => {
              const r = await post<{ added: number }>(`/api/challah/${ev.id}/to-mitch`, {});
              setMsg({ ok: true, text: r.added ? `${r.added} משתתפות נוספו לרשימת המתחזקות למעקב` : "כל מי שהגיעה כבר במעקב" });
              reload();
            }}
          >
            <Icon name="heart" /> העברת מי שהגיעה למעקב מתחזקות
          </button>
        ) : null}
      </section>

      <section className="adm-panel">
        <h2>תיעוד האירוע</h2>
        <textarea className="textarea" placeholder="איך היה, מה דובר, למי לחזור..." value={summary} onChange={(e) => setSummary(e.target.value)} />
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--ghost btn--sm" disabled={summary === ev.summary} onClick={() => onSave({ ...ev, summary })}>
            <Icon name="check" /> שמירת תיעוד
          </button>
        </div>
      </section>
    </>
  );
}

