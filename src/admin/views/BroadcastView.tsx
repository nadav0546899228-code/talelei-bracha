/**
 * הודעות ותפוצה: הודעה קולית (מוקראת/מוקלטת), צינתוק ו-SMS דרך ימות המשיח,
 * ווואטסאפ/מייל מהמכשיר. נמענים: אברכים, רכזים, מלוות, נרשמות לעדכונים, מחזקים ואנשי קשר.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, fmtDateTime, post, put, type Me } from "../api";
import { groupInMode, MODE_LABELS, type Mode } from "../nav";
import { SwipeHint, SwipeRow, waLink } from "../components";
import { parsePasted } from "../xlsx";
import { useLive } from "../live";

type Channel = "voice_tts" | "voice_template" | "tzintuk" | "sms" | "whatsapp" | "email";
type Setup = {
  channels: Record<Channel, string>;
  yemotConfigured: boolean;
  units: number | null;
  settings: { templateId: string; callerId: string; smsFrom: string };
  canEditSettings: boolean;
  canContacts: boolean;
  allowManual: boolean;
  groups: { id: string; label: string; count: number; phones: number; emails: number }[];
};
type Recipient = { name: string; phone: string; email: string };

const CHANNEL_INFO: Record<Channel, { hint: string; yemot: boolean; needsText: boolean }> = {
  voice_tts: { hint: "שיחה לכל נמען שמקריאה את הנוסח (כמו ימות המשיח)", yemot: true, needsText: true },
  voice_template: { hint: "השמעת הודעה שהוקלטה בתבנית בימות המשיח", yemot: true, needsText: false },
  tzintuk: { hint: "צלצול קצר מהמספר של המערכת - תזכורת", yemot: true, needsText: false },
  sms: { hint: "הודעת טקסט מהמספר של המערכת", yemot: true, needsText: true },
  whatsapp: { hint: "נשלח מהטלפון שלך, נמען אחרי נמען", yemot: false, needsText: true },
  email: { hint: "נפתח במייל שלך עם כל הנמענים בעותק מוסתר", yemot: false, needsText: true },
};

export function BroadcastView({ me, mode, initialTab }: { me: Me; mode: Mode; initialTab?: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [tab, setTab] = useState<"send" | "history" | "contacts">(initialTab === "history" || initialTab === "contacts" ? initialTab : "send");
  const [err, setErr] = useState<string | null>(null);
  // רק הקבוצות של המצב הנוכחי (בנים / בנות) - בלי ערבוב
  const load = useCallback(
    () =>
      api<Setup>("/api/broadcast/setup")
        .then((r) => setSetup({ ...r, groups: r.groups.filter((g) => groupInMode(g.id, mode)) }))
        .catch((e) => setErr(e.message)),
    [mode],
  );
  useEffect(() => {
    load();
  }, [load]);
  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!setup) return <p className="muted">טוען…</p>;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>הודעות ותפוצה · {MODE_LABELS[mode]}</h1>
          <p>
            הודעה קולית, צינתוק ו-SMS דרך ימות המשיח · וואטסאפ ומייל מהמכשיר.
            {setup.units !== null ? ` יתרת יחידות בימות: ${setup.units}` : ""}
          </p>
        </div>
      </div>
      <div className="adm-tabs-inline" role="tablist">
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "send"} onClick={() => setTab("send")}>
          שליחה
        </button>
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "history"} onClick={() => setTab("history")}>
          היסטוריה
        </button>
        {setup.canContacts ? (
          <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "contacts"} onClick={() => setTab("contacts")}>
            אנשי קשר ומחזקים
          </button>
        ) : null}
      </div>
      {!setup.yemotConfigured ? (
        <div className="adm-alert adm-alert--info" style={{ marginBottom: 14 }}>
          ימות המשיח עדיין לא מחובר - שיחות קוליות, צינתוקים ו-SMS יופעלו אחרי הוספת <code>YEMOT_TOKEN</code> ל-Secrets. וואטסאפ ומייל זמינים כבר עכשיו.
        </div>
      ) : null}
      {tab === "send" ? <SendTab setup={setup} me={me} reload={load} /> : null}
      {tab === "history" ? <HistoryTab /> : null}
      {tab === "contacts" && setup.canContacts ? <ContactsTab onChange={load} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ שליחה */

function SendTab({ setup, me, reload }: { setup: Setup; me: Me; reload: () => void }) {
  const [channel, setChannel] = useState<Channel>(setup.yemotConfigured ? "voice_tts" : "whatsapp");
  const [groups, setGroups] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState(setup.settings.templateId);
  const [testPhone, setTestPhone] = useState(me.user.phone || "");
  const [preview, setPreview] = useState<Recipient[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [queue, setQueue] = useState<{ list: Recipient[]; done: Set<string> } | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [saved, setSaved] = useState<{ id: string; name: string; text: string }[]>([]);
  const loadSaved = useCallback(() => api<{ templates: { id: string; name: string; text: string }[] }>("/api/broadcast/saved").then((r) => setSaved(r.templates)).catch(() => undefined), []);
  useEffect(() => {
    loadSaved();
  }, [loadSaved]);
  const info = CHANNEL_INFO[channel];

  const loadPreview = useCallback(async () => {
    if (!groups.length && !manual.trim()) {
      setPreview([]);
      return [];
    }
    const r = await post<{ recipients: Recipient[] }>("/api/broadcast/preview", { groups, manual });
    setPreview(r.recipients);
    return r.recipients;
  }, [groups, manual]);

  useEffect(() => {
    const t = window.setTimeout(() => loadPreview(), 300);
    return () => window.clearTimeout(t);
  }, [loadPreview]);

  const relevant = useMemo(() => (preview ?? []).filter((r) => (channel === "email" ? r.email : r.phone)), [preview, channel]);
  const personalize = (r: Recipient) => text.replace(/\{שם\}/g, r.name || "").replace(/\s{2,}/g, " ").trim();

  const send = async (test: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post<{ recipients?: Recipient[]; result?: { campaignId?: string; estimatedPrice?: number; entriesCount?: number } }>("/api/broadcast/send", {
        channel,
        groups,
        manual,
        text,
        templateId,
        testPhone: test ? testPhone : undefined,
        scheduleAt: !test && info.yemot && scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
      });
      if ((r as { scheduled?: string }).scheduled) {
        setMsg({ ok: true, text: `התפוצה תוזמנה ל-${new Date((r as { scheduled: string }).scheduled).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}` });
        setConfirming(false);
        setScheduleAt("");
        return;
      }
      if (channel === "whatsapp") {
        setQueue({ list: (r.recipients ?? []).filter((x) => x.phone), done: new Set() });
      } else if (channel === "email") {
        const emails = (r.recipients ?? []).map((x) => x.email).filter(Boolean);
        for (let i = 0; i < emails.length; i += 50) {
          window.open(`mailto:?bcc=${encodeURIComponent(emails.slice(i, i + 50).join(","))}&body=${encodeURIComponent(text)}`, "_blank");
        }
        setMsg({ ok: true, text: `נפתח מייל עם ${emails.length} נמענים בעותק מוסתר` });
      } else {
        const res = r.result || {};
        setMsg({
          ok: true,
          text: `${test ? "שליחת בדיקה" : "התפוצה"} נשלחה לימות המשיח${res.entriesCount ? ` · ${res.entriesCount} נמענים` : ""}${res.estimatedPrice !== undefined ? ` · עלות משוערת ${res.estimatedPrice} יחידות` : ""}`,
        });
      }
      setConfirming(false);
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const canSend = relevant.length > 0 && (!info.needsText || text.trim()) && (!info.yemot || setup.yemotConfigured) && (channel !== "voice_template" || templateId);

  return (
    <>
      <section className="adm-panel">
        <h2>ערוץ שליחה</h2>
        <div className="adm-channel" role="radiogroup" aria-label="ערוץ">
          {(Object.keys(CHANNEL_INFO) as Channel[]).map((c) => {
            const off = CHANNEL_INFO[c].yemot && !setup.yemotConfigured;
            return (
              <label key={c} className={off ? "is-off" : ""}>
                <input type="radio" name="channel" checked={channel === c} disabled={off} onChange={() => setChannel(c)} />
                <span>
                  {setup.channels[c]}
                  <small>{CHANNEL_INFO[c].hint}</small>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="adm-panel">
        <h2>נמענים</h2>
        <div className="adm-fields adm-fields--2">
          {setup.groups.map((g) => (
            <label key={g.id} className="adm-toggle">
              <input type="checkbox" checked={groups.includes(g.id)} onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))} />
              <span>
                {g.label} <span className="muted">({channel === "email" ? g.emails : g.phones})</span>
              </span>
            </label>
          ))}
        </div>
        {!setup.groups.length ? <p className="muted">אין קבוצות זמינות לתפקיד שלך.</p> : null}
        {setup.allowManual ? (
          <label className="field" style={{ marginTop: 12 }}>
            <span className="field__label">מספרים נוספים (מופרדים ברווח או פסיק)</span>
            <textarea className="textarea" dir="ltr" style={{ minHeight: 70, textAlign: "right" }} value={manual} onChange={(e) => setManual(e.target.value)} />
          </label>
        ) : null}
        <p style={{ marginBottom: 0 }}>
          <strong>{relevant.length}</strong> נמענים {channel === "email" ? "עם מייל" : "עם טלפון"} (ללא כפילויות)
          {preview && preview.length > relevant.length ? <span className="muted"> · {preview.length - relevant.length} בלי {channel === "email" ? "מייל" : "טלפון"}</span> : null}
        </p>
      </section>

      <section className="adm-panel">
        <h2>תוכן ההודעה</h2>
        {channel === "voice_template" ? (
          <label className="field">
            <span className="field__label">מזהה תבנית בימות המשיח (שבה הוקלטה ההודעה)</span>
            <input className="input" dir="ltr" style={{ textAlign: "right" }} value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
          </label>
        ) : null}
        {info.needsText ? (
          <div className="adm-chips" style={{ flexWrap: "wrap" }}>
            {saved.map((t) => (
              <button key={t.id} type="button" className="adm-chip" onClick={() => setText(t.text)} title={t.text}>
                <Icon name="file" width={14} height={14} /> {t.name}
              </button>
            ))}
            {text.trim() ? (
              <button
                type="button"
                className="adm-chip"
                onClick={async () => {
                  const name = window.prompt("שם לתבנית:", "");
                  if (!name?.trim()) return;
                  await post("/api/broadcast/saved", { name, text });
                  loadSaved();
                }}
              >
                <Icon name="plus" width={14} height={14} /> שמירה כתבנית
              </button>
            ) : null}
          </div>
        ) : null}
        {info.needsText ? (
          <label className="field">
            <span className="field__label">{channel === "voice_tts" ? "הנוסח שיוקרא בשיחה" : "נוסח ההודעה"}</span>
            <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} maxLength={channel === "sms" ? 670 : 1000} />
            <span className="field__hint">
              אפשר לכתוב {"{שם}"} - יוחלף בשם של כל נמען. {channel === "sms" ? `${text.length} תווים${text.length > 70 ? ` · ${Math.ceil(text.length / 67)} הודעות` : ""}` : ""}
              {channel === "voice_tts" ? " מומלץ לכתוב מספרים במילים ולהימנע מקיצורים." : ""}
            </span>
          </label>
        ) : channel === "tzintuk" ? (
          <p className="muted">צינתוק לא כולל תוכן - הנמען רואה שיחה שלא נענתה מהמספר של המערכת.</p>
        ) : null}
      </section>

      <section className="adm-panel">
        <h2>שליחה</h2>
        {info.yemot ? (
          <div className="adm-toolbar">
            <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} placeholder="הטלפון שלי לבדיקה" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} aria-label="טלפון לבדיקה" />
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy || !testPhone || (info.needsText && !text.trim()) || !setup.yemotConfigured} onClick={() => send(true)}>
              שליחת בדיקה אליי
            </button>
          </div>
        ) : null}
        {info.yemot ? (
          <label className="field" style={{ maxWidth: 320 }}>
            <span className="field__label">
              <Icon name="clock" width={14} height={14} style={{ verticalAlign: "-2px" }} /> שליחה מתוזמנת (לא חובה)
            </span>
            <input className="input" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </label>
        ) : null}
        <button type="button" className="btn btn--flame" disabled={!canSend || busy} onClick={() => setConfirming(true)}>
          <Icon name={scheduleAt && info.yemot ? "clock" : "share"} />{" "}
          {channel === "whatsapp" ? "הכנת רשימת וואטסאפ" : channel === "email" ? "פתיחת מייל" : scheduleAt ? `תזמון ל-${relevant.length} נמענים` : `שליחה ל-${relevant.length} נמענים`}
        </button>
        {info.yemot ? <ScheduledList /> : null}
        {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`}>{msg.text}</div> : null}
      </section>

      {setup.canEditSettings ? <YemotSettings setup={setup} onSaved={reload} /> : null}

      {confirming ? (
        <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="אישור שליחה">
          <div className="adm-modal">
            <h2>לשלוח {setup.channels[channel]}?</h2>
            <p>
              ל-<strong>{relevant.length}</strong> נמענים.
              {info.yemot ? " השליחה דרך ימות המשיח צורכת יחידות מהחשבון ואי אפשר לבטל אותה אחרי שיצאה." : ""}
            </p>
            {text ? (
              <div className="adm-note" style={{ marginBottom: 12 }}>
                <small>דוגמה לנמען הראשון:</small>
                {relevant[0] ? personalize(relevant[0]) : text}
              </div>
            ) : null}
            <div className="btn-row">
              <button type="button" className="btn btn--flame btn--sm" disabled={busy} onClick={() => send(false)}>
                {busy ? "שולח…" : scheduleAt && info.yemot ? "כן, לתזמן" : "כן, לשלוח"}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {queue ? (
        <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="שליחת וואטסאפ">
          <div className="adm-modal">
            <h2>
              וואטסאפ - {queue.done.size}/{queue.list.length} נשלחו
            </h2>
            <p className="muted">לוחצים על כל שם - נפתח וואטסאפ עם ההודעה מוכנה. חוזרים לכאן וממשיכים לבא.</p>
            <div className="adm-list">
              {queue.list.map((r) => (
                <a
                  key={r.phone}
                  className={`adm-row adm-row--tone-${queue.done.has(r.phone) ? "green" : "none"}`}
                  href={waLink(r.phone, personalize(r))}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none" }}
                  onClick={() => setQueue({ ...queue, done: new Set([...queue.done, r.phone]) })}
                >
                  <span className="adm-row__title">{r.name || r.phone}</span>
                  <span>{queue.done.has(r.phone) ? "✓ נשלח" : <Icon name="whatsapp" width={20} height={20} />}</span>
                </a>
              ))}
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQueue(null)}>
                סגירה
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function YemotSettings({ setup, onSaved }: { setup: Setup; onSaved: () => void }) {
  const [s, setS] = useState(setup.settings);
  const [templates, setTemplates] = useState<{ templateId: number; description: string }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="adm-panel">
      <h2>הגדרות ימות המשיח</h2>
      <div className="adm-fields adm-fields--2">
        <label className="field">
          <span className="field__label">תבנית קמפיין להודעות מוקראות</span>
          <input className="input" dir="ltr" style={{ textAlign: "right" }} value={s.templateId} onChange={(e) => setS({ ...s, templateId: e.target.value })} />
          <span className="field__hint">יוצרים פעם אחת תבנית קמפיין במערכת ימות ומזינים את המספר שלה.</span>
        </label>
        <label className="field">
          <span className="field__label">מספר מזוהה ליוצאות (אופציונלי)</span>
          <input className="input" dir="ltr" style={{ textAlign: "right" }} value={s.callerId} onChange={(e) => setS({ ...s, callerId: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">שולח SMS (אופציונלי)</span>
          <input className="input" dir="ltr" style={{ textAlign: "right" }} value={s.smsFrom} onChange={(e) => setS({ ...s, smsFrom: e.target.value })} />
        </label>
      </div>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => {
            try {
              await put("/api/broadcast/settings", s);
              setMsg("נשמר");
              onSaved();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "שגיאה");
            }
          }}
        >
          שמירה
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={!setup.yemotConfigured}
          onClick={async () => {
            try {
              const r = await api<{ templates: { templateId: number; description: string }[] }>("/api/broadcast/templates");
              setTemplates(r.templates);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "שגיאה");
            }
          }}
        >
          טעינת תבניות מימות
        </button>
      </div>
      {templates ? (
        <ul>
          {templates.map((t) => (
            <li key={t.templateId}>
              <button type="button" className="text-link" style={{ background: "none", border: 0, cursor: "pointer", color: "var(--teal)" }} onClick={() => setS({ ...s, templateId: String(t.templateId) })}>
                {t.templateId}
              </button>{" "}
              - {t.description}
            </li>
          ))}
        </ul>
      ) : null}
      {msg ? <div className="adm-alert adm-alert--info">{msg}</div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ היסטוריה */

type BLog = { id: string; channelLabel: string; text: string; groups: string[]; count: number; test: boolean; byName: string; status: string; campaignId?: string; result?: { error?: string }; createdAt: string };

function HistoryTab() {
  const [rows, setRows] = useState<BLog[] | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  useEffect(() => {
    api<{ broadcasts: BLog[] }>("/api/broadcast/history").then((r) => setRows(r.broadcasts));
  }, []);
  const check = async (b: BLog) => {
    try {
      const r = await api<{ status: { entries?: { status?: string }[] } | null }>(`/api/broadcast/status/${b.id}`);
      const entries = r.status?.entries ?? [];
      const counts: Record<string, number> = {};
      for (const e of entries) counts[e.status || "?"] = (counts[e.status || "?"] || 0) + 1;
      setStatus({ ...status, [b.id]: Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ") || "אין נתונים עדיין" });
    } catch (e) {
      setStatus({ ...status, [b.id]: e instanceof Error ? e.message : "שגיאה" });
    }
  };
  return (
    <div className="adm-list">
      {(rows ?? []).map((b) => (
        <div key={b.id} className={`adm-row adm-row--tone-${b.status === "error" ? "red" : b.test ? "yellow" : "green"}`} style={{ cursor: "default" }}>
          <span className="adm-row__title">
            {b.channelLabel}
            {b.test ? " (בדיקה)" : ""} · {b.count} נמענים
          </span>
          {b.campaignId ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => check(b)}>
              סטטוס
            </button>
          ) : (
            <span />
          )}
          <span className="adm-row__sub">
            {fmtDateTime(b.createdAt)} · {b.byName} · {b.groups.join(", ")}
            {b.text ? ` · "${b.text.slice(0, 60)}${b.text.length > 60 ? "…" : ""}"` : ""}
            {b.result?.error ? ` · שגיאה: ${b.result.error}` : ""}
            {status[b.id] ? ` · ${status[b.id]}` : ""}
          </span>
        </div>
      ))}
      {rows && !rows.length ? <p className="adm-empty">עדיין לא נשלחו הודעות.</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ אנשי קשר */

type Contact = { id: string; name: string; phone: string; email: string; tags: string[]; notes: string; active: boolean };

function ContactsTab({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [edit, setEdit] = useState<Partial<Contact> & { tagsText?: string } | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api<{ contacts: Contact[] }>("/api/broadcast/contacts").then((r) => setRows(r.contacts)), []);
  useEffect(() => {
    load();
  }, [load]);
  const tags = Array.from(new Set((rows ?? []).flatMap((c) => c.tags)));
  const list = (rows ?? []).filter((c) => (!tag || c.tags.includes(tag)) && (!q.trim() || `${c.name} ${c.phone} ${c.email}`.includes(q.trim())));

  const save = async (body: unknown) => {
    try {
      const r = await post<{ count: number }>("/api/broadcast/contacts", body);
      setMsg(`נשמרו ${r.count} רשומות`);
      setEdit(null);
      setPaste(null);
      load();
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "שגיאה");
    }
  };

  return (
    <>
      <div className="adm-toolbar">
        <input className="input" type="search" placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש איש קשר" />
        <select className="select adm-select-sm" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="סינון לפי תגית">
          <option value="">כל התגיות</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--sm" onClick={() => setEdit({ name: "", phone: "", email: "", tagsText: "מחזק" })}>
          <Icon name="plus" /> איש קשר
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPaste("")}>
          ייבוא מאקסל
        </button>
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        תגיות לדוגמה: מחזק, תורם, הורים, מתנדב. כל תגית הופכת לקבוצת תפוצה.
      </p>
      {msg ? <div className="adm-alert adm-alert--info" style={{ marginBottom: 10 }}>{msg}</div> : null}
      {edit ? (
        <section className="adm-panel">
          <div className="adm-fields adm-fields--2">
            <label className="field">
              <span className="field__label">שם</span>
              <input className="input" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">טלפון</span>
              <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">מייל</span>
              <input className="input" type="email" dir="ltr" style={{ textAlign: "right" }} value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">תגיות (מופרדות בפסיק)</span>
              <input className="input" value={edit.tagsText ?? ""} onChange={(e) => setEdit({ ...edit, tagsText: e.target.value })} />
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn--sm" onClick={() => save({ id: edit.id, name: edit.name, phone: edit.phone, email: edit.email, tags: edit.tagsText })}>
              שמירה
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(null)}>
              ביטול
            </button>
            {edit.id ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ color: "#b3261e" }}
                onClick={async () => {
                  if (!window.confirm(`למחוק את ${edit.name}?`)) return;
                  await del(`/api/broadcast/contacts/${edit.id}`);
                  setEdit(null);
                  load();
                }}
              >
                <Icon name="trash" /> מחיקה
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      <SwipeHint />
      <div className="adm-list">
        {list.map((c) => (
          <SwipeRow key={c.id} phone={c.phone || undefined} waText={`שלום ${c.name}, `} tone={c.phone ? "green" : "yellow"} onClick={() => setEdit({ ...c, tagsText: c.tags.join(", ") })}>
            <span className="adm-row__title">{c.name || c.phone}</span>
            <span />
            <span className="adm-row__sub">
              <span dir="ltr">{c.phone}</span>
              {c.email ? ` · ${c.email}` : ""}
              {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
            </span>
          </SwipeRow>
        ))}
        {rows && !list.length ? <p className="adm-empty">אין אנשי קשר.</p> : null}
      </div>

      {paste !== null ? (
        <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="ייבוא אנשי קשר">
          <div className="adm-modal">
            <h2>ייבוא אנשי קשר</h2>
            <p className="muted">
              מעתיקים מאקסל עמודות לפי הסדר: <strong>שם · טלפון · מייל · תגיות</strong> ומדביקים. מספר שכבר קיים - יעודכן.
            </p>
            <textarea className="textarea" style={{ minHeight: 160 }} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="נתונים להדבקה" />
            <p>{parsePasted(paste).length} שורות</p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  const rows = parsePasted(paste);
                  const body = /שם/.test(rows[0]?.join(" ") ?? "") ? rows.slice(1) : rows;
                  save({ rows: body.map((r) => ({ name: r[0], phone: r[1], email: r[2], tags: r[3] })) });
                }}
              >
                ייבוא
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPaste(null)}>
                סגירה
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ תפוצות מתוזמנות */

function ScheduledList() {
  const [rows, setRows] = useState<{ id: string; at: string; channelLabel: string; count: number; text: string; status: string; error?: string }[]>([]);
  const load = useCallback(() => api<{ scheduled: typeof rows }>("/api/broadcast/scheduled").then((r) => setRows(r.scheduled)).catch(() => undefined), []);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["bcScheduled"], load);
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <h3 className="adm-subhead">
        <Icon name="clock" width={16} height={16} style={{ verticalAlign: "-3px" }} /> מתוזמנות
      </h3>
      <div className="adm-list">
        {rows.map((x) => (
          <div key={x.id} className={`adm-row adm-row--tone-${x.status === "error" ? "red" : "yellow"}`} style={{ cursor: "default" }}>
            <span className="adm-row__title">
              {new Date(x.at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })} · {x.channelLabel}
            </span>
            {x.status === "scheduled" ? (
              <button
                type="button"
                className="adm-icon-btn adm-icon-btn--danger"
                aria-label="ביטול"
                onClick={async () => {
                  if (!window.confirm("לבטל את התפוצה המתוזמנת?")) return;
                  await del(`/api/broadcast/scheduled/${x.id}`);
                  load();
                }}
              >
                <Icon name="trash" />
              </button>
            ) : (
              <span />
            )}
            <span className="adm-row__sub">
              {x.count} נמענים{x.text ? ` · ${x.text.slice(0, 60)}` : ""}
              {x.status === "error" ? ` · נכשל: ${x.error}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
