/** כולל ערב: אברכים לפי ערים וסניפים, דיווח נסיעות והוצאות */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, post, type Me, type OrgUnit } from "../api";
import { ContactActions, money, SwipeHint, SwipeRow, ToneLegend } from "../components";
import { ENTRY_LABELS, type Avrech, type Entry, type EntryType, type KollelSettings } from "../kollelCalc";
import { parsePasted } from "../xlsx";

export type Overview = {
  me: { manager: boolean; canEditAvrechim: boolean; canPayroll: boolean };
  avrechim: Avrech[];
  cities: OrgUnit[];
  branches: OrgUnit[];
  settings: KollelSettings;
  months: { id: string; label: string; locked: boolean; order: number }[];
};

type Tab = "avrechim" | "entries";

const blankAvrech = (branchId: string | null): Avrech => ({ id: "", name: "", phone: "", email: "", branchId, monthlyTravel: 0, inPayroll: true, simchaFund: true, simchaExternal: false, active: true, notes: "" });

/** "סניף רמות (ירושלים)" */
export function branchLabel(ov: Pick<Overview, "cities" | "branches">, id: string | null | undefined) {
  const b = ov.branches.find((x) => x.id === id);
  if (!b) return "ללא סניף";
  const c = ov.cities.find((x) => x.id === b.parentId);
  return `${b.name}${c ? ` (${c.name})` : ""}`;
}

export function KollelView({ me, go, initialTab }: { me: Me; go?: (v: "org") => void; initialTab?: string }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab === "entries" ? "entries" : "avrechim");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Overview>("/api/kollel/overview").then(setOv).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!ov) return <p className="muted">טוען…</p>;
  const manager = ov.me.manager;
  const scopeLine = manager
    ? "כל האברכים לפי ערים וסניפים, ודיווחי נסיעות והוצאות."
    : ov.me.canEditAvrechim
      ? `העיר שלך: ${ov.cities.map((c) => c.name).join(", ") || "לא שויכה עיר"}. האברכים בכל סניפי העיר ודיווח נסיעות והוצאות.`
      : `הסניף שלך: ${ov.branches.map((b) => branchLabel(ov, b.id)).join(", ") || "לא שויך סניף"}. הדיווח שלך הוא גם האישור.`;

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>כולל ערב</h1>
          <p>{scopeLine}</p>
        </div>
        {me.user.views.includes("org") && go ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => go("org")}>
            ערים, סניפים ורכזים
          </button>
        ) : null}
      </div>
      <div className="adm-tabs-inline" role="tablist">
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "avrechim"} onClick={() => setTab("avrechim")}>
          אברכים ({ov.avrechim.filter((a) => a.active).length})
        </button>
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "entries"} onClick={() => setTab("entries")}>
          נסיעות והוצאות
        </button>
      </div>
      {tab === "avrechim" ? <AvrechimTab ov={ov} reload={load} /> : null}
      {tab === "entries" ? <EntriesTab ov={ov} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ אברכים */

function AvrechimTab({ ov, reload }: { ov: Overview; reload: () => void }) {
  const manager = ov.me.manager;
  const canEdit = ov.me.canEditAvrechim;
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sel, setSel] = useState<Avrech | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const list = ov.avrechim.filter((a) => (showInactive || a.active) && (!q.trim() || `${a.name} ${a.phone}`.includes(q.trim())));
  const known = new Set(ov.branches.map((b) => b.id));
  const groups = [
    ...ov.branches.map((b) => ({ id: b.id, name: `סניף ${branchLabel(ov, b.id)}`, items: list.filter((a) => a.branchId === b.id) })),
    { id: "", name: "ללא סניף", items: list.filter((a) => !a.branchId || !known.has(a.branchId)) },
  ].filter((g) => g.items.length);

  const save = async () => {
    if (!sel) return;
    try {
      await post("/api/kollel/avrechim", sel);
      setMsg({ ok: true, text: "נשמר" });
      setSel(null);
      reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };

  return (
    <>
      <div className="adm-toolbar">
        <input className="input" type="search" placeholder="חיפוש אברך" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש אברך" />
        {canEdit ? (
          <>
            <label className="adm-toggle">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              כולל לא פעילים
            </label>
            <button type="button" className="btn btn--sm" onClick={() => setSel(blankAvrech(ov.branches.length === 1 ? ov.branches[0].id : null))}>
              <Icon name="plus" /> אברך
            </button>
            {manager ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImporting(true)}>
                ייבוא מאקסל
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <ToneLegend
        items={[
          { tone: "green", label: "פעיל" },
          { tone: "yellow", label: "חסר טלפון" },
          { tone: "grey", label: "לא פעיל" },
        ]}
      />
      <SwipeHint />
      {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`} style={{ marginBottom: 10 }}>{msg.text}</div> : null}

      <div className="adm-split">
        <div>
          {groups.map((g) => (
            <section key={g.id} style={{ marginBottom: 18 }}>
              <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>
                {g.name} <span className="muted">({g.items.length})</span>
              </h2>
              <div className="adm-list">
                {g.items.map((a) => (
                  <SwipeRow key={a.id} phone={a.phone || undefined} waText={`שלום ${a.name}, `} tone={!a.active ? "grey" : a.phone ? "green" : "yellow"} current={sel?.id === a.id} onClick={() => setSel({ ...a })}>
                    <span className="adm-row__title">{a.name}</span>
                    <span className="muted" style={{ fontSize: "0.88rem" }}>
                      {a.monthlyTravel ? `נסיעות ${money(a.monthlyTravel)}` : ""}
                    </span>
                    <span className="adm-row__sub" dir="auto">
                      {a.phone || "אין טלפון"}

                      {manager && !a.inPayroll ? " · לא בטבלת המשכורות" : ""}
                    </span>
                  </SwipeRow>
                ))}
              </div>
            </section>
          ))}
          {!groups.length ? <div className="adm-panel adm-empty">אין אברכים{canEdit ? ". אפשר להוסיף" + (manager ? " או לייבא מאקסל." : ".") : " בסניף שלך עדיין."}</div> : null}
        </div>

        {sel ? (
          <section className="adm-panel adm-detail is-open" aria-label="כרטיס אברך">
            <div className="adm-panel__head">
              <h2>{sel.id ? sel.name : "אברך חדש"}</h2>
              <button type="button" className="btn btn--ghost btn--sm adm-sheet-back" onClick={() => setSel(null)}>
                ← חזרה
              </button>
            </div>
            <ContactActions phone={sel.phone || undefined} email={sel.email || undefined} waText={`שלום ${sel.name}, `} />
            {canEdit ? (
              <>
                <div className="adm-fields adm-fields--2">
                  <label className="field">
                    <span className="field__label">שם</span>
                    <input className="input" value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field__label">טלפון</span>
                    <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={sel.phone} onChange={(e) => setSel({ ...sel, phone: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field__label">סניף</span>
                    <select className="select" value={sel.branchId ?? ""} onChange={(e) => setSel({ ...sel, branchId: e.target.value || null })}>
                      {manager || !sel.branchId ? <option value="">{manager ? "ללא סניף" : "בחירת סניף…"}</option> : null}
                      {ov.cities.map((c) => (
                        <optgroup key={c.id} label={c.name}>
                          {ov.branches
                            .filter((b) => b.parentId === c.id)
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    {!ov.branches.length ? <span className="field__hint">אין עדיין סניפים. מוסיפים במסך "ערים, סניפים ורכזים".</span> : null}
                  </label>
                  <label className="field">
                    <span className="field__label">נסיעות - סכום קבוע חודשי (₪)</span>
                    <input className="input" type="number" inputMode="numeric" disabled={!manager} value={sel.monthlyTravel || ""} onChange={(e) => setSel({ ...sel, monthlyTravel: Number(e.target.value) || 0 })} />
                    {!manager ? <span className="field__hint">הגדרות שכר - הרכז הראשי</span> : null}
                  </label>
                  <label className="field span-2">
                    <span className="field__label">מייל</span>
                    <input className="input" type="email" dir="ltr" style={{ textAlign: "right" }} value={sel.email ?? ""} onChange={(e) => setSel({ ...sel, email: e.target.value })} />
                  </label>
                  {manager ? (
                    <>
                      <label className="adm-toggle span-2">
                        <input type="checkbox" checked={sel.inPayroll} onChange={(e) => setSel({ ...sel, inPayroll: e.target.checked })} />
                        חלק מטבלת המשכורות הקבועה
                      </label>
                      <label className="adm-toggle span-2">
                        <input type="checkbox" checked={sel.simchaFund} onChange={(e) => setSel({ ...sel, simchaFund: e.target.checked })} />
                        משתתף בקופת השמחות (מורידים לו ונספר לבעל השמחה)
                      </label>
                      <label className="adm-toggle span-2">
                        <input type="checkbox" checked={sel.simchaExternal} onChange={(e) => setSel({ ...sel, simchaExternal: e.target.checked })} />
                        ההורדה לשמחות נגבית ממשכורת אחרת (לא יורד בטבלה הזו)
                      </label>
                    </>
                  ) : null}
                  <label className="adm-toggle span-2">
                    <input type="checkbox" checked={sel.active} onChange={(e) => setSel({ ...sel, active: e.target.checked })} />
                    פעיל
                  </label>
                  <label className="field span-2">
                    <span className="field__label">הערות פנימיות</span>
                    <textarea className="textarea" value={sel.notes ?? ""} onChange={(e) => setSel({ ...sel, notes: e.target.value })} />
                  </label>
                </div>
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn--sm" onClick={save}>
                    שמירה
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSel(null)}>
                    ביטול
                  </button>
                </div>
              </>
            ) : (
              <dl>
                <dt>סניף</dt>
                <dd>{branchLabel(ov, sel.branchId)}</dd>
                <dt>טלפון</dt>
                <dd dir="ltr">{sel.phone || "-"}</dd>
                <dt>נסיעות חודשיות</dt>
                <dd>{money(sel.monthlyTravel)}</dd>
              </dl>
            )}
          </section>
        ) : (
          <div className="adm-panel adm-empty adm-detail-empty">
            <Icon name="eye" />
            בחרו אברך לפרטים
          </div>
        )}
      </div>

      {importing ? <ImportModal ov={ov} onClose={() => setImporting(false)} onDone={reload} /> : null}
    </>
  );
}

function ImportModal({ ov, onClose, onDone }: { ov: Overview; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState<string | null>(null);
  const rows = useMemo(() => {
    const parsed = parsePasted(text);
    const first = parsed[0]?.join(" ") ?? "";
    const body = /שם/.test(first) ? parsed.slice(1) : parsed;
    return body.map((r) => ({ name: r[0] ?? "", phone: r[1] ?? "", monthlyTravel: r[2] ?? "", branchName: r[3] ?? "" })).filter((r) => r.name);
  }, [text]);
  const run = async () => {
    try {
      const r = await post<{ added: number; updated: number }>("/api/kollel/avrechim/bulk", { rows });
      setRes(`נוספו ${r.added}, עודכנו ${r.updated}`);
      onDone();
    } catch (e) {
      setRes(e instanceof Error ? e.message : "שגיאה");
    }
  };
  return (
    <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="ייבוא אברכים">
      <div className="adm-modal">
        <h2>ייבוא אברכים מאקסל</h2>
        <p className="muted">
          מעתיקים מאקסל את העמודות לפי הסדר: <strong>שם · טלפון · נסיעות חודשיות · שם הסניף</strong> ומדביקים כאן. אברך שכבר קיים (לפי שם) - יעודכן.
          {ov.branches.length ? ` סניפים קיימים: ${ov.branches.map((b) => b.name).join(", ")}` : ""}
        </p>
        <textarea className="textarea" style={{ minHeight: 160 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"שם\tטלפון\tנסיעות\tסניף"} aria-label="נתונים להדבקה" />
        {rows.length ? (
          <p>
            <strong>{rows.length}</strong> שורות זוהו. דוגמה: {rows[0].name} {rows[0].phone && `· ${rows[0].phone}`} {rows[0].monthlyTravel && `· ${rows[0].monthlyTravel} ₪`} {rows[0].branchName && `· ${rows[0].branchName}`}
          </p>
        ) : null}
        {res ? <div className="adm-alert adm-alert--info">{res}</div> : null}
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--sm" disabled={!rows.length} onClick={run}>
            ייבוא
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            סגירה
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ דיווחים */

function EntriesTab({ ov }: { ov: Overview }) {
  const manager = ov.me.manager;
  const open = ov.months.filter((m) => !m.locked);
  const [month, setMonth] = useState<string>(open[0]?.id ?? ov.months[0]?.id ?? "");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [form, setForm] = useState<{ avrechId: string; type: EntryType; amount: string; description: string }>({ avrechId: "", type: "travel", amount: "", description: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = ov.months.find((m) => m.id === month)?.locked ?? false;
  const avs = ov.avrechim.filter((a) => a.active);
  const types: EntryType[] = manager ? ["travel", "expense", "bonus", "grant", "deduction"] : ["travel", "expense"];

  const load = useCallback(() => {
    if (!month) return;
    api<{ entries: Entry[] }>(`/api/kollel/entries?month=${encodeURIComponent(month)}`).then((r) => setEntries(r.entries));
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);

  if (!ov.months.length) {
    return <div className="adm-panel adm-empty">עדיין לא נפתח חודש. הרכז הראשי פותח חודש חדש במסך "משכורות".</div>;
  }

  const add = async () => {
    setMsg(null);
    try {
      await post("/api/kollel/entries", { ...form, amount: Number(form.amount), month });
      setForm({ ...form, amount: "", description: "" });
      setMsg({ ok: true, text: "נשמר ואושר" });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("למחוק את הדיווח?")) return;
    try {
      await del(`/api/kollel/entries/${id}`);
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };

  const name = (id: string) => ov.avrechim.find((a) => a.id === id)?.name ?? "-";
  const total = (entries ?? []).reduce((t, e) => t + e.amount, 0);

  return (
    <>
      <div className="adm-toolbar">
        <label className="field" style={{ minWidth: 200 }}>
          <span className="field__label">חודש</span>
          <select className="select" value={month} onChange={(e) => setMonth(e.target.value)}>
            {ov.months.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.locked ? " (סגור לתשלום)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!locked ? (
        <section className="adm-panel">
          <h2>דיווח חדש</h2>
          <p className="muted" style={{ marginTop: -6 }}>
            הנסיעות הקבועות של כל אברך נכנסות אוטומטית. כאן מדווחים תוספת או הפחתה (למשל לא הגיע שבוע - סכום שלילי), והוצאות.
          </p>
          <div className="adm-fields adm-fields--2">
            <label className="field">
              <span className="field__label">אברך</span>
              <select className="select" value={form.avrechId} onChange={(e) => setForm({ ...form, avrechId: e.target.value })}>
                <option value="">בחירה…</option>
                {avs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">סוג</span>
              <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EntryType })}>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {ENTRY_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">סכום (₪)</span>
              <input className="input" type="number" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">פירוט</span>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="למשל: נסיעה לכנס / ספרים" />
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--sm" disabled={!form.avrechId || !Number(form.amount)} onClick={add}>
              שמירה ואישור
            </button>
          </div>
          {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`}>{msg.text}</div> : null}
        </section>
      ) : (
        <div className="adm-alert adm-alert--info" style={{ marginBottom: 14 }}>
          החודש נסגר לתשלום - אי אפשר להוסיף או למחוק דיווחים.
        </div>
      )}

      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>דיווחים בחודש</h2>
          <strong>{money(total)}</strong>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">אברך</th>
                <th scope="col">סוג</th>
                <th scope="col">סכום</th>
                <th scope="col">פירוט</th>
                <th scope="col">דווח ואושר ע״י</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id}>
                  <td>{name(e.avrechId)}</td>
                  <td>{ENTRY_LABELS[e.type]}</td>
                  <td style={{ whiteSpace: "nowrap", color: e.amount < 0 ? "#b3261e" : undefined }}>{money(e.amount)}</td>
                  <td>{e.description}</td>
                  <td>{e.byName}</td>
                  <td>
                    {!locked ? (
                      <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label="מחיקת דיווח" onClick={() => remove(e.id)}>
                        <Icon name="trash" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries && !entries.length ? <p className="muted">אין דיווחים בחודש הזה.</p> : null}
      </section>
    </>
  );
}
