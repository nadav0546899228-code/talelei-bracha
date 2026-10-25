/** משכורות כולל ערב - חודש בכל פעם, לפי הכללים הקבועים, עם סגירה לתשלום וייצוא לאקסל */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, put, type Me } from "../api";
import { money, ToneLegend } from "../components";
import {
  computePayroll,
  hebrewMonthLabel,
  SIMCHA_LABELS,
  type Entry,
  type KollelSettings,
  type MonthDoc,
  type MonthRow,
  type PayrollLine,
  type Simcha,
} from "../kollelCalc";
import { buildXlsx, downloadBlob, type Sheet } from "../xlsx";
import type { Overview } from "./KollelView";

const emptyMonth = (label: string): MonthDoc => ({ label, order: Date.now(), rows: {}, extraIds: [], simchas: [], locked: false, notes: "" });

function monthSheet(label: string, lines: PayrollLine[]): Sheet {
  const total = lines.reduce((t, l) => t + l.total, 0);
  return {
    name: label,
    widths: [24, 60, 14],
    moneyCols: [2],
    totalRow: true,
    rows: [["שם", "פירוט", "סכום"], ...lines.map((l) => [l.avrech.name, l.detail, l.total]), ["סה״כ", `${lines.length} אברכים`, total]],
  };
}

export function PayrollView({ me }: { me: Me }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [key, setKey] = useState<string>("");
  const [month, setMonth] = useState<MonthDoc | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const privileged = me.user.roles.includes("ceo") || me.user.roles.includes("developer");

  const loadOv = useCallback(async () => {
    const o = await api<Overview>("/api/kollel/overview");
    setOv(o);
    return o;
  }, []);

  useEffect(() => {
    loadOv().then((o) => setKey((k) => k || o.months[0]?.id || ""));
  }, [loadOv]);

  useEffect(() => {
    if (!key) return;
    setDirty(false);
    Promise.all([
      api<{ month: MonthDoc | null }>(`/api/kollel/months/${encodeURIComponent(key)}`),
      api<{ entries: Entry[] }>(`/api/kollel/entries?month=${encodeURIComponent(key)}`),
    ]).then(([m, e]) => {
      setMonth(m.month ?? emptyMonth(key));
      setEntries(e.entries);
    });
  }, [key]);

  const lines = useMemo(() => (ov && month ? computePayroll(ov.avrechim, month, entries, ov.settings) : []), [ov, month, entries]);

  if (!ov) return <p className="muted">טוען…</p>;

  const s = ov.settings;
  const locked = Boolean(month?.locked);
  const total = lines.reduce((t, l) => t + l.total, 0);
  const missing = lines.filter((l) => !l.confirmed);

  const setRow = (id: string, patch: Partial<MonthRow>) => {
    if (!month || locked) return;
    const prev = month.rows[id] ?? { base: null, travel: null, confirmed: false, note: "" };
    setMonth({ ...month, rows: { ...month.rows, [id]: { ...prev, ...patch } } });
    setDirty(true);
  };

  const saveMonth = async (next: MonthDoc, text = "נשמר") => {
    try {
      await put(`/api/kollel/months/${encodeURIComponent(key)}`, next);
      setMonth(next);
      setDirty(false);
      setMsg({ ok: true, text });
      loadOv();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };

  const createMonth = async () => {
    const label = window.prompt("שם החודש (חודש עברי):", hebrewMonthLabel());
    if (!label?.trim()) return;
    const k = label.trim();
    if (ov.months.some((m) => m.id === k)) {
      setKey(k);
      return;
    }
    await put(`/api/kollel/months/${encodeURIComponent(k)}`, emptyMonth(k));
    await loadOv();
    setKey(k);
  };

  const exportMonth = () => {
    if (!month) return;
    downloadBlob(buildXlsx([monthSheet(month.label, lines)]), `משכורות ${month.label}.xlsx`);
  };

  const exportAll = async () => {
    const all = await api<{ entries: Entry[] }>("/api/kollel/entries?all=1");
    const months = [...ov.months].sort((a, b) => a.order - b.order);
    const docs = await Promise.all(months.map((m) => api<{ month: MonthDoc | null }>(`/api/kollel/months/${encodeURIComponent(m.id)}`)));
    const per = months.map((m, i) => ({ label: m.label, lines: computePayroll(ov.avrechim, docs[i].month, all.entries.filter((e) => e.month === m.id), s) }));
    const names = Array.from(new Set(per.flatMap((p) => p.lines.map((l) => l.avrech.name))));
    const summary: Sheet = {
      name: "סיכום כל התקופות",
      widths: [22, 16, 12],
      moneyCols: [1],
      totalRow: true,
      rows: [["חודש", "סה״כ לתשלום", "אברכים"], ...per.map((p) => [p.label, p.lines.reduce((t, l) => t + l.total, 0), p.lines.length]), ["סה״כ", per.reduce((t, p) => t + p.lines.reduce((x, l) => x + l.total, 0), 0), ""]],
    };
    const byAvrech: Sheet = {
      name: "לפי אברך",
      widths: [24, ...per.map(() => 14), 14],
      moneyCols: [...per.map((_, i) => i + 1), per.length + 1],
      totalRow: true,
      rows: [
        ["שם", ...per.map((p) => p.label), "סה״כ"],
        ...names.map((n) => {
          const vals = per.map((p) => p.lines.find((l) => l.avrech.name === n)?.total ?? 0);
          return [n, ...vals, vals.reduce((a, b) => a + b, 0)];
        }),
        ["סה״כ", ...per.map((p) => p.lines.reduce((t, l) => t + l.total, 0)), per.reduce((t, p) => t + p.lines.reduce((x, l) => x + l.total, 0), 0)],
      ],
    };
    downloadBlob(buildXlsx([...per.map((p) => monthSheet(p.label, p.lines)), summary, byAvrech]), `כל טבלאות המשכורות.xlsx`);
  };

  const nonMembers = ov.avrechim.filter((a) => !lines.some((l) => l.avrech.id === a.id));

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>משכורות</h1>
          <p>
            בסיס מלא {money(s.fullBase)} · שמחות: בת {s.simchaRates.bat} ₪, בן {s.simchaRates.ben} ₪, בר מצווה {s.simchaRates.barmitzva} ₪ לאברך
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--sm" onClick={createMonth}>
            <Icon name="plus" /> חודש חדש
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSettingsOpen(true)}>
            הגדרות
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={exportAll} disabled={!ov.months.length}>
            <Icon name="download" /> כל החודשים לאקסל
          </button>
        </div>
      </div>

      {!ov.months.length ? (
        <div className="adm-panel adm-empty">אין עדיין חודשים. לוחצים "חודש חדש" כדי לפתוח את החודש הנוכחי.</div>
      ) : (
        <>
          <div className="adm-toolbar">
            <select className="select adm-select-sm" value={key} onChange={(e) => (dirty && !window.confirm("יש שינויים שלא נשמרו. לעבור בכל זאת?") ? null : setKey(e.target.value))} aria-label="חודש">
              {ov.months.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.locked ? " · סגור" : ""}
                </option>
              ))}
            </select>
            <span className={`adm-status ${locked ? "adm-status--done" : "adm-status--in_progress"}`}>{locked ? "סגור לתשלום" : "פתוח לעריכה"}</span>
            <label className="adm-toggle">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              מי חסר? ({missing.length})
            </label>
          </div>

          <div className="adm-stats">
            <div className="adm-stat">
              <div className="adm-stat__n">{money(total)}</div>
              <div className="adm-stat__l">סה״כ לתשלום</div>
            </div>
            <div className="adm-stat">
              <div className="adm-stat__n">{lines.length}</div>
              <div className="adm-stat__l">אברכים בטבלה</div>
            </div>
            <div className="adm-stat adm-stat--rose">
              <div className="adm-stat__n">{missing.length}</div>
              <div className="adm-stat__l">טרם סומנו כבדוקים</div>
            </div>
          </div>

          <ToneLegend
            items={[
              { tone: "red", label: "טרם נבדק" },
              { tone: "green", label: "נבדק" },
              { tone: "grey", label: "0 ₪" },
            ]}
          />
          <div className="adm-table-wrap">
            <table className="adm-table adm-pay">
              <thead>
                <tr>
                  <th scope="col">נבדק</th>
                  <th scope="col">שם</th>
                  <th scope="col">בסיס</th>
                  <th scope="col">נסיעות קבועות</th>
                  <th scope="col">פירוט</th>
                  <th scope="col">סכום</th>
                </tr>
              </thead>
              <tbody>
                {lines
                  .filter((l) => !onlyMissing || !l.confirmed)
                  .map((l) => {
                    const row = month?.rows[l.avrech.id];
                    const tone = l.total === 0 ? "grey" : l.confirmed ? "green" : "red";
                    return (
                      <tr key={l.avrech.id} className={`adm-tr--${tone} ${l.total === 0 ? "is-zero" : ""}`}>
                        <td>
                          <input type="checkbox" checked={l.confirmed} disabled={locked} onChange={(e) => setRow(l.avrech.id, { confirmed: e.target.checked })} aria-label={`סימון ${l.avrech.name} כנבדק`} style={{ width: 20, height: 20 }} />
                        </td>
                        <td>
                          <strong>{l.avrech.name}</strong>
                          {!l.avrech.inPayroll ? <div className="muted" style={{ fontSize: "0.8rem" }}>נוסף לחודש זה</div> : null}
                        </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            inputMode="numeric"
                            disabled={locked}
                            placeholder="מלא"
                            title={`ריק = מלא (${s.fullBase} ₪)`}
                            value={row?.base ?? ""}
                            onChange={(e) => setRow(l.avrech.id, { base: e.target.value === "" ? null : Number(e.target.value) })}
                            aria-label={`בסיס ל${l.avrech.name}`}
                          />
                        </td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            inputMode="numeric"
                            disabled={locked}
                            placeholder={String(l.avrech.monthlyTravel || 0)}
                            value={row?.travel ?? ""}
                            onChange={(e) => setRow(l.avrech.id, { travel: e.target.value === "" ? null : Number(e.target.value) })}
                            aria-label={`נסיעות ל${l.avrech.name}`}
                          />
                        </td>
                        <td className="detail">{l.detail || <span className="muted">-</span>}</td>
                        <td style={{ whiteSpace: "nowrap", fontWeight: 800 }}>{money(l.total)}</td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td>סה״כ</td>
                  <td colSpan={3}>{lines.length} אברכים</td>
                  <td style={{ whiteSpace: "nowrap" }}>{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted" style={{ fontSize: "0.88rem" }}>
            בסיס ריק = מלא. נסיעות ריקות = הסכום הקבוע של האברך; התאמות שדיווח רכז המשנה מתווספות לפירוט. בעמודת הפירוט לא נרשם "מלא".
          </p>

          <div className="adm-split" style={{ marginTop: 16 }}>
            <SimchasPanel
              month={month}
              lines={lines}
              settings={s}
              locked={locked}
              onChange={(simchas) => {
                if (!month) return;
                setMonth({ ...month, simchas });
                setDirty(true);
              }}
            />
            <section className="adm-panel">
              <h2>הוספת אברך שאינו בטבלה הקבועה</h2>
              <p className="muted">למשל מי שמשתתף רק החודש. יופיע רק בחודש זה.</p>
              <div className="adm-toolbar">
                <select
                  className="select adm-select-sm"
                  disabled={locked}
                  value=""
                  onChange={(e) => {
                    if (!month || !e.target.value) return;
                    setMonth({ ...month, extraIds: [...month.extraIds, e.target.value] });
                    setDirty(true);
                  }}
                  aria-label="הוספת אברך לחודש"
                >
                  <option value="">בחירה…</option>
                  {nonMembers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              {month?.extraIds.length ? (
                <div className="adm-roles">
                  {month.extraIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="adm-chip"
                      disabled={locked}
                      onClick={() => {
                        setMonth({ ...month, extraIds: month.extraIds.filter((x) => x !== id) });
                        setDirty(true);
                      }}
                    >
                      {ov.avrechim.find((a) => a.id === id)?.name} ✕
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <div className="adm-savebar">
            <span>{dirty ? "יש שינויים שלא נשמרו" : msg?.text ?? (locked ? "החודש סגור לתשלום" : "הכל שמור")}</span>
            <div className="btn-row">
              <button type="button" className="btn btn--light btn--sm" onClick={exportMonth}>
                <Icon name="download" /> אקסל לחודש
              </button>
              {!locked ? (
                <>
                  <button type="button" className="btn btn--flame btn--sm" disabled={!dirty} onClick={() => month && saveMonth(month)}>
                    שמירה
                  </button>
                  <button
                    type="button"
                    className="btn btn--light btn--sm"
                    onClick={() => {
                      if (!month) return;
                      if (missing.length && !window.confirm(`${missing.length} אברכים טרם סומנו כנבדקים. לסגור בכל זאת?`)) return;
                      saveMonth({ ...month, locked: true }, "החודש נסגר לתשלום");
                    }}
                  >
                    <Icon name="lock" /> סגירה לתשלום
                  </button>
                </>
              ) : privileged ? (
                <button type="button" className="btn btn--light btn--sm" onClick={() => month && window.confirm("לפתוח את החודש לעריכה?") && saveMonth({ ...month, locked: false }, "החודש נפתח לעריכה")}>
                  פתיחה לעריכה
                </button>
              ) : null}
            </div>
          </div>
          {msg && !msg.ok ? <div className="adm-alert adm-alert--error">{msg.text}</div> : null}
        </>
      )}

      {settingsOpen ? <SettingsModal settings={s} onClose={() => setSettingsOpen(false)} onSaved={() => loadOv()} /> : null}
    </>
  );
}

function SimchasPanel({ month, lines, settings, locked, onChange }: { month: MonthDoc | null; lines: PayrollLine[]; settings: KollelSettings; locked: boolean; onChange: (s: Simcha[]) => void }) {
  const [form, setForm] = useState<{ celebrantId: string; type: Simcha["type"]; note: string }>({ celebrantId: "", type: "bat", note: "" });
  const simchas = month?.simchas ?? [];
  const fundCount = lines.filter((l) => l.avrech.simchaFund).length;
  const name = (id: string) => lines.find((l) => l.avrech.id === id)?.avrech.name ?? "-";
  return (
    <section className="adm-panel">
      <h2>שמחות החודש</h2>
      <p className="muted">
        מורידים מכל חבר בקופה ({fundCount} חברים, כולל בעל השמחה), ובעל השמחה מקבל את הסכום המצטבר.
      </p>
      {simchas.map((x) => (
        <div key={x.id} className="adm-row adm-row--tone-green" style={{ cursor: "default", marginBottom: 6 }}>
          <span className="adm-row__title">
            {name(x.celebrantId)} - {x.note || SIMCHA_LABELS[x.type]}
          </span>
          {!locked ? (
            <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label="הסרת שמחה" onClick={() => onChange(simchas.filter((s) => s.id !== x.id))}>
              <Icon name="trash" />
            </button>
          ) : (
            <span />
          )}
          <span className="adm-row__sub">
            {settings.simchaRates[x.type]} ₪ מכל אחד · מקבל {money(settings.simchaRates[x.type] * fundCount)}
          </span>
        </div>
      ))}
      {!locked ? (
        <div className="adm-fields adm-fields--2" style={{ marginTop: 10 }}>
          <label className="field">
            <span className="field__label">בעל השמחה</span>
            <select className="select" value={form.celebrantId} onChange={(e) => setForm({ ...form, celebrantId: e.target.value })}>
              <option value="">בחירה…</option>
              {lines.map((l) => (
                <option key={l.avrech.id} value={l.avrech.id}>
                  {l.avrech.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">סוג</span>
            <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Simcha["type"] })}>
              <option value="bat">הולדת בת ({settings.simchaRates.bat} ₪)</option>
              <option value="ben">הולדת בן ({settings.simchaRates.ben} ₪)</option>
              <option value="barmitzva">בר מצווה ({settings.simchaRates.barmitzva} ₪)</option>
            </select>
          </label>
          <label className="field span-2">
            <span className="field__label">פירוט (אופציונלי)</span>
            <input className="input" value={form.note} placeholder={SIMCHA_LABELS[form.type]} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div>
            <button
              type="button"
              className="btn btn--sm"
              disabled={!form.celebrantId}
              onClick={() => {
                onChange([...simchas, { id: crypto.randomUUID(), ...form }]);
                setForm({ celebrantId: "", type: "bat", note: "" });
              }}
            >
              <Icon name="plus" /> הוספת שמחה
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SettingsModal({ settings, onClose, onSaved }: { settings: KollelSettings; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState(settings);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      await put("/api/kollel/settings", s);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  return (
    <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="הגדרות משכורות">
      <div className="adm-modal">
        <h2>הגדרות משכורות</h2>
        <div className="adm-fields adm-fields--2">
          <label className="field span-2">
            <span className="field__label">בסיס "מלא" (₪)</span>
            <input className="input" type="number" value={s.fullBase} onChange={(e) => setS({ ...s, fullBase: Number(e.target.value) })} />
          </label>
          {(["bat", "ben", "barmitzva"] as const).map((k) => (
            <label key={k} className="field">
              <span className="field__label">{SIMCHA_LABELS[k]} - לאברך (₪)</span>
              <input className="input" type="number" value={s.simchaRates[k]} onChange={(e) => setS({ ...s, simchaRates: { ...s.simchaRates, [k]: Number(e.target.value) } })} />
            </label>
          ))}
        </div>
        {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn--sm" onClick={save}>
            שמירה
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
