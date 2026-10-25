/** תצוגת פניות - משמשת גם את "אישה לאישה" וגם את "פניות" */
import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import {
  del,
  displayName,
  FIELD_LABELS,
  fmtDateTime,
  FORM_LABELS,
  patch,
  STATUS_FLOW,
  STATUS_LABELS,
  valueText,
  type FormKey,
  type Status,
  type Submission,
} from "../api";
import type { AdminCtx } from "../AdminApp";
import { ContactActions, IconActions, SwipeRow, ToneLegend, toneFor } from "../components";
import { buildXlsx, downloadBlob } from "../xlsx";

function toSheet(rows: Submission[], name: string) {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.data)))).filter((k) => k !== "consent");
  return {
    name,
    widths: [16, 14, 12, ...keys.map(() => 22)],
    rows: [
      ["תאריך", "סוג", "סטטוס", ...keys.map((k) => FIELD_LABELS[k] || k)],
      ...rows.map((r) => [fmtDateTime(r.createdAt), FORM_LABELS[r.form], STATUS_LABELS[r.status], ...keys.map((k) => valueText(r.data[k]))]),
    ],
  };
}

export function SubmissionsView({ me, subs, refreshSubs, forms, title, initialForm }: AdminCtx & { forms: FormKey[]; title: string; initialForm?: FormKey }) {
  const [form, setForm] = useState<FormKey>(initialForm && forms.includes(initialForm) ? initialForm : forms[0]);
  const [status, setStatus] = useState<Status | "open" | "all">("open");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const privileged = me.user.roles.includes("ceo") || me.user.roles.includes("developer");
  const all = subs ?? [];
  const mentors = all.filter((s) => s.form === "ishaMentor" && s.status === "approved");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all
      .filter((s) => s.form === form)
      .filter((s) =>
        status === "all" ? true : status === "open" ? !["done", "archived", "rejected"].includes(s.status) : s.status === status,
      )
      .filter((s) => !term || Object.values(s.data).some((v) => valueText(v).toLowerCase().includes(term)));
  }, [all, form, status, q]);

  const selected = all.find((s) => s.id === selectedId) ?? null;

  const update = async (body: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      await patch(`/api/admin/submissions/${selected.id}`, body);
      await refreshSubs();
      setMsg("נשמר");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected || !window.confirm("למחוק את הפנייה לצמיתות? לא ניתן לשחזר.")) return;
    await del(`/api/admin/submissions/${selected.id}`);
    setSelectedId(null);
    await refreshSubs();
  };

  const exportCsv = () => {
    downloadBlob(buildXlsx([toSheet(rows, FORM_LABELS[form])]), `${FORM_LABELS[form]}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const countNew = (f: FormKey) => all.filter((s) => s.form === f && s.status === "new").length;
  const mentorName = (id: string | null) => {
    const m = all.find((s) => s.id === id);
    return m ? displayName(m) : null;
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{title}</h1>
          <p>{forms.includes("ishaRequest") ? "מידע רגיש - לצוות המורשה בלבד. אין להעביר פרטים מחוץ למערכת." : "פניות שהתקבלו מטפסי האתר."}</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => refreshSubs()}>
            <Icon name="refresh" />
            רענון
          </button>
          {privileged ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={exportCsv} disabled={!rows.length}>
              <Icon name="download" />
              ייצוא לאקסל
            </button>
          ) : null}
        </div>
      </div>

      <div className="adm-toolbar" role="group" aria-label="סוג פנייה">
        {forms.map((f) => (
          <button
            key={f}
            type="button"
            className="adm-chip"
            aria-pressed={form === f}
            onClick={() => {
              setForm(f);
              setSelectedId(null);
            }}
          >
            {FORM_LABELS[f]}
            {countNew(f) ? <span className="adm-badge">{countNew(f)}</span> : null}
          </button>
        ))}
      </div>
      <div className="adm-toolbar">
        <input className="input" type="search" placeholder="חיפוש בשם, טלפון, טקסט…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש" />
        <select className="select adm-select-sm" value={status} onChange={(e) => setStatus(e.target.value as Status | "open" | "all")} aria-label="סינון סטטוס">
          <option value="open">פתוחות</option>
          <option value="all">הכול</option>
          {STATUS_FLOW[form].map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="muted" aria-live="polite">
          {rows.length} רשומות
        </span>
      </div>

      <ToneLegend
        items={[
          { tone: "red", label: "חדשה - דורשת טיפול" },
          { tone: "yellow", label: "בטיפול" },
          { tone: "green", label: form === "ishaMentor" ? "מאושרת" : "טופלה" },
          { tone: "grey", label: "ארכיון / לא מתאימה" },
        ]}
      />
      
      <div className="adm-split">
        <div className="adm-list">
          {subs === null ? (
            <p className="muted">טוען…</p>
          ) : rows.length ? (
            rows.map((s) => (
              <SwipeRow
                key={s.id}
                phone={typeof s.data.phone === "string" ? s.data.phone : undefined}
                tone={toneFor(s.status)}
                current={s.id === selectedId}
                actions={
                  <IconActions
                    phone={typeof s.data.phone === "string" && s.data.phone ? s.data.phone : undefined}
                    email={typeof s.data.email === "string" && s.data.email && !s.data.phone ? s.data.email : undefined}
                    waText={`שלום ${displayName(s)}, `}
                  />
                }
                onClick={() => {
                  setSelectedId(s.id);
                  setMsg(null);
                  setNote("");
                }}
              >
                <span className="adm-row__title">{displayName(s)}</span>
                <span className={`adm-status adm-status--${s.status}`}>{STATUS_LABELS[s.status]}</span>
                <span className="adm-row__sub">
                  {fmtDateTime(s.createdAt)}
                  {s.form === "ishaRequest" ? ` · ${s.assignedMentorId ? `מלווה: ${mentorName(s.assignedMentorId) ?? "-"}` : "ללא מלווה"}` : ""}
                  {s.data.subject ? ` · ${valueText(s.data.subject)}` : ""}
                </span>
              </SwipeRow>
            ))
          ) : (
            <div className="adm-empty adm-panel">
              <Icon name="inbox" />
              אין רשומות בסינון הזה.
            </div>
          )}
        </div>

        {selected ? (
          <section className="adm-panel adm-detail is-open" aria-label="פרטי פנייה">
            <div className="adm-panel__head">
              <h2>{displayName(selected)}</h2>
              <button type="button" className="btn btn--ghost btn--sm adm-sheet-back" onClick={() => setSelectedId(null)}>
                ← חזרה לרשימה
              </button>
            </div>
            <p className="muted" style={{ marginTop: -6 }}>
              {FORM_LABELS[selected.form]} · התקבלה {fmtDateTime(selected.createdAt)}
            </p>
            <ContactActions
              phone={typeof selected.data.phone === "string" ? selected.data.phone : undefined}
              email={typeof selected.data.email === "string" ? selected.data.email : undefined}
            />
            <dl>
              {Object.entries(selected.data)
                .filter(([k]) => k !== "consent")
                .map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{FIELD_LABELS[k] || k}</dt>
                    <dd>
                      {k === "phone" && typeof v === "string" ? (
                        <>
                          <a href={`tel:${v.replace(/[^\d+]/g, "")}`} dir="ltr">
                            {v}
                          </a>
                          {" · "}
                          <a href={`https://wa.me/${v.replace(/\D/g, "").replace(/^0/, "972")}`} target="_blank" rel="noopener noreferrer">
                            וואטסאפ
                          </a>
                        </>
                      ) : k === "email" && typeof v === "string" && v ? (
                        <a href={`mailto:${v}`}>{v}</a>
                      ) : (
                        valueText(v) || "-"
                      )}
                    </dd>
                  </div>
                ))}
            </dl>

            <div className="adm-fields adm-fields--2">
              <label className="field">
                <span className="field__label">סטטוס</span>
                <select className="select" value={selected.status} disabled={busy} onChange={(e) => update({ status: e.target.value })}>
                  {STATUS_FLOW[selected.form].map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              {selected.form === "ishaRequest" ? (
                <label className="field">
                  <span className="field__label">שיבוץ מלווה</span>
                  <select
                    className="select"
                    value={selected.assignedMentorId ?? ""}
                    disabled={busy}
                    onChange={(e) => update({ assignedMentorId: e.target.value || null })}
                  >
                    <option value="">- ללא -</option>
                    {mentors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {displayName(m)}
                        {m.data.availability ? ` (${valueText(m.data.availability)})` : ""}
                      </option>
                    ))}
                  </select>
                  {!mentors.length ? <span className="field__hint">אין עדיין מלוות מאושרות. מאשרים מלווה בלשונית "מלוות".</span> : null}
                </label>
              ) : null}
              {selected.form === "ishaMentor" ? (
                <div className="field">
                  <span className="field__label">פניות משובצות</span>
                  <span>
                    {all.filter((s) => s.assignedMentorId === selected.id && !["done", "archived"].includes(s.status)).length} פעילות
                  </span>
                </div>
              ) : null}
            </div>

            <h2 style={{ marginTop: 18 }}>הערות פנימיות</h2>
            <div className="adm-notes">
              {(selected.notes || []).length ? (
                selected.notes.map((n, i) => (
                  <div className="adm-note" key={i}>
                    <small>
                      {n.by} · {fmtDateTime(n.at)}
                    </small>
                    {n.text}
                  </div>
                ))
              ) : (
                <span className="muted">אין הערות.</span>
              )}
            </div>
            <textarea
              className="textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="הערה לצוות (ללא תוכן שיחה רגיש)"
              aria-label="הערה חדשה"
              maxLength={1000}
            />
            <div className="btn-row" style={{ marginTop: 10, justifyContent: "space-between" }}>
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy || !note.trim()}
                onClick={async () => {
                  await update({ note });
                  setNote("");
                }}
              >
                הוספת הערה
              </button>
              {privileged ? (
                <button type="button" className="btn btn--ghost btn--sm" style={{ color: "#b3261e" }} onClick={remove}>
                  <Icon name="trash" />
                  מחיקה
                </button>
              ) : null}
            </div>
            {msg ? (
              <div className={`adm-alert ${msg === "נשמר" ? "adm-alert--ok" : "adm-alert--error"}`} role="status">
                {msg}
              </div>
            ) : null}
          </section>
        ) : (
          <div className="adm-panel adm-empty adm-detail-empty">
            <Icon name="eye" />
            בחרו רשומה מהרשימה כדי לראות פרטים ולעדכן
          </div>
        )}
      </div>
    </>
  );
}
