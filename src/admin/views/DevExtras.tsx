/** מסך מתכנת: גיבויים יומיים ושחזור, וכתובת לשלוחת הנוכחות בימות המשיח */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, fmtDateTime, post } from "../api";
import { runtime } from "../../config/contentModel";

type Backup = { id: string; at: string; reason: string; byName: string; count: number };

export function DevExtras() {
  const [list, setList] = useState<Backup[] | null>(null);
  const [hook, setHook] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ backups: Backup[] }>("/api/admin/backups").then((r) => setList(r.backups)), []);
  useEffect(() => {
    load();
  }, [load]);

  const now = async () => {
    setBusy(true);
    await post("/api/admin/backups", {}).catch((e) => setMsg({ ok: false, text: e.message }));
    setBusy(false);
    load();
  };
  const restore = async (b: Backup) => {
    const ans = window.prompt(`שחזור יחזיר את כל הנתונים למצב של ${fmtDateTime(b.at)}.\nלפני השחזור נשמר גיבוי של המצב הנוכחי.\nלאישור כתבו: שחזור`);
    if (ans !== "שחזור") return;
    setBusy(true);
    try {
      await post(`/api/admin/backups/${b.id}/restore`, { confirm: "שחזור" });
      setMsg({ ok: true, text: "השחזור הושלם" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
    setBusy(false);
    load();
  };

  return (
    <>
      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>
            <Icon name="shield" width={20} height={20} style={{ verticalAlign: "-4px" }} /> גיבויים
          </h2>
          <button type="button" className="btn btn--sm" disabled={busy} onClick={now}>
            <Icon name="plus" /> גיבוי עכשיו
          </button>
        </div>
        <p className="muted" style={{ marginTop: -6 }}>
          גיבוי אוטומטי פעם ביום. נשמרים 14 אחרונים.
        </p>
        {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`}>{msg.text}</div> : null}
        <div className="adm-list">
          {(list ?? []).map((b) => (
            <div key={b.id} className="adm-row adm-row--tone-green" style={{ cursor: "default" }}>
              <span className="adm-row__title">{fmtDateTime(b.at)}</span>
              <span className="adm-item__actions">
                <a className="adm-icon-btn" href={`/api/admin/backups/${b.id}`} download aria-label="הורדה" title="הורדה">
                  <Icon name="download" />
                </a>
                <button type="button" className="adm-icon-btn" disabled={busy} onClick={() => restore(b)} aria-label="שחזור" title="שחזור">
                  <Icon name="refresh" />
                </button>
              </span>
              <span className="adm-row__sub">
                {b.reason} · {b.count} רשומות
              </span>
            </div>
          ))}
          {list && !list.length ? <p className="muted">עדיין אין גיבויים. הראשון ייווצר תוך דקה מהפעלת השרת.</p> : null}
        </div>
      </section>

      {!runtime.demo ? (
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Icon name="sparkle" width={20} height={20} style={{ verticalAlign: "-4px" }} /> נתוני דמה
            </h2>
            <span className="adm-item__actions">
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("להוסיף נתוני דמה לאתר? הנתונים האמיתיים לא נמחקים, ואפשר לנקות את הדמה בכל רגע.")) return;
                  setBusy(true);
                  await post("/api/admin/demo/seed", {}).catch((e) => setMsg({ ok: false, text: e.message }));
                  window.location.reload();
                }}
              >
                <Icon name="plus" /> הוספה
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("למחוק את כל נתוני הדמה? נתונים אמיתיים לא יימחקו.")) return;
                  setBusy(true);
                  try {
                    const r = await post<{ removed: number }>("/api/admin/demo/clear", {});
                    setMsg({ ok: true, text: `נמחקו ${r.removed} רשומות דמה` });
                  } catch (e) {
                    setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
                  }
                  setBusy(false);
                }}
              >
                <Icon name="trash" /> ניקוי
              </button>
            </span>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            כל רשומות הדמה מסומנות "(דמה)". רכזים לדוגמה: טלפון 0500000100 עד 0500000104, קוד 1234.
          </p>
        </section>
      ) : null}

      {runtime.demo ? (
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Icon name="sparkle" width={20} height={20} style={{ verticalAlign: "-4px" }} /> נתוני דמה
            </h2>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm("לאפס את כל נתוני הדמה למצב ההתחלתי?")) return;
                setBusy(true);
                await post("/api/admin/demo/reset", {}).catch((e) => setMsg({ ok: false, text: e.message }));
                window.location.reload();
              }}
            >
              <Icon name="refresh" /> איפוס
            </button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            אתר הפיתוח עובד על נתוני דמה בלבד. האתר המפורסם לא מושפע. רכזים לדוגמה נכנסים בטלפון 0500000100 עד 0500000104, קוד 1234.
          </p>
        </section>
      ) : null}

      <section className="adm-panel">
        <h2>
          <Icon name="phone" width={20} height={20} style={{ verticalAlign: "-4px" }} /> נוכחות בטלפון - ימות המשיח
        </h2>
        <p className="muted" style={{ marginTop: -6 }}>
          אברך מתקשר למספר בימות, והנוכחות שלו נרשמת לפי מספר הטלפון שלו. בימות: שלוחה מסוג API, ובשדה הכתובת מדביקים:
        </p>
        {hook ? (
          <div className="adm-code" dir="ltr" style={{ fontSize: "0.82rem", wordBreak: "break-all", textAlign: "left" }}>
            {hook}
          </div>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => api<{ url: string }>("/api/admin/yemot-hook").then((r) => setHook(r.url))}>
            הצגת הכתובת
          </button>
        )}
      </section>
    </>
  );
}
