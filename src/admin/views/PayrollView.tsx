/** משכורות כולל ערב - חודש בכל פעם, לפי הכללים הקבועים, עם סגירה לתשלום וייצוא לאקסל */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, post, put, type Me } from "../api";
import { BranchExpenses, branchExpensesSheet, useBranchExpenses } from "./BranchExpenses";
import { Chips, Combo, money } from "../components";
import {
  computePayroll,
  hebrewMonthLabel,
  hebrewYearLabel,
  hebrewYearMonthLabels,
  hebrewYearNum,
  yearOfMonthLabel,
  SIMCHA_LABELS,
  type AttendanceSession,
  ENTRY_LABELS,
  type Entry,
  type EntryType,
  type KollelSettings,
  type MonthDoc,
  type MonthRow,
  type PayrollLine,
  type Simcha,
} from "../kollelCalc";
import { buildXlsx, downloadBlob, type Sheet } from "../xlsx";
import { buildMasav } from "../masav";
import type { Overview } from "./KollelView";
import { useLive } from "../live";

/** שנה עברית מלאה (5787) מתווית חודש */
const yearNumOf = (label: string) => {
  const y = yearOfMonthLabel(label);
  const now = hebrewYearNum();
  for (let k = now - 6; k <= now + 2; k++) if (hebrewYearLabel(k) === y) return k;
  return 0;
};
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
  const [exOpen, setExOpen] = useState<string | null>(null);
  const [year, setYear] = useState<number>(() => hebrewYearNum());
  // לשוניות החודשים נצמדות לתחתית - מעל הסרגל התחתון / ליד סרגל צד ותפריט
  const [tabsPos, setTabsPos] = useState<{ bottom?: number; left?: number; right?: number }>({});
  useEffect(() => {
    const place = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      let bottom = 0, left = 0, right = 0;
      document.querySelectorAll<HTMLElement>(".adm-tabs, .adm-side, aside.adm-nav").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).display === "none") return;
        if (r.width > vw * 0.6 && r.top > vh * 0.5) bottom = Math.max(bottom, vh - r.top);
        else if (r.height > vh * 0.5 && r.left < 4) left = Math.max(left, r.right);
        else if (r.height > vh * 0.5 && r.right > vw - 4) right = Math.max(right, vw - r.left);
      });
      setTabsPos({ bottom, left, right });
    };
    place();
    const t = window.setInterval(place, 1500);
    window.addEventListener("resize", place);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", place);
    };
  }, []);
  const [exForm, setExForm] = useState<{ type: EntryType; amount: string; description: string }>({ type: "travel", amount: "", description: "" });
  const bx = useBranchExpenses(key);
  const privileged = me.user.roles.includes("ceo") || me.user.roles.includes("developer");

  const loadOv = useCallback(async () => {
    const o = await api<Overview>("/api/kollel/overview");
    setOv(o);
    return o;
  }, []);

  useEffect(() => {
    loadOv().then((o) => setKey((k) => k || (o.months.some((m) => m.id === hebrewMonthLabel()) ? hebrewMonthLabel() : o.months[0]?.id || "")));
  }, [loadOv]);

  // עדכון חי - בלי לדרוס עריכה שלא נשמרה
  const [tick, setTick] = useState(0);
  useLive(["avrechim", "kollelMonths", "kollelEntries", "kollelSettings", "kollelAttendance", "kollelMonthStatus"], () => {
    loadOv();
    if (!dirtyRef.current) setTick((t) => t + 1);
  });
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!key) return;
    setDirty(false);
    Promise.all([
      api<{ month: MonthDoc | null }>(`/api/kollel/months/${encodeURIComponent(key)}`),
      api<{ entries: Entry[] }>(`/api/kollel/entries?month=${encodeURIComponent(key)}`),
      api<{ sessions: AttendanceSession[] }>(`/api/kollel/attendance?month=${encodeURIComponent(key)}`).catch(() => ({ sessions: [] })),
    ]).then(([m, e, a]) => {
      setMonth(m.month ?? emptyMonth(key));
      setEntries(e.entries);
      setSessions(a.sessions);
    });
  }, [key, tick]);

  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [stage, setStage] = useState<{ cities: { id: string; name: string; approved: unknown }[] } | null>(null);
  useEffect(() => {
    if (!key) return;
    api<{ cities: { id: string; name: string; approved: unknown }[] }>(`/api/kollel/status?month=${encodeURIComponent(key)}`).then(setStage).catch(() => setStage(null));
  }, [key, tick]);
  useEffect(() => {
    const y = yearNumOf(key);
    if (y) setYear(y);
  }, [key]);
  const lines = useMemo(() => (ov && month ? computePayroll(ov.avrechim, month, entries, ov.settings, sessions) : []), [ov, month, entries, sessions]);

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

  // קובץ להעברה בנקאית: שם, ת״ז, בנק, סניף, חשבון, סכום
  const exportBank = () => {
    if (!month) return;
    const pay = lines.filter((l) => l.total > 0);
    const missingBank = pay.filter((l) => !l.avrech.bank?.account);
    const rows = [
      ["שם המוטב", "ת״ז", "בנק", "סניף", "מספר חשבון", "סכום", "תיאור"],
      ...pay.map((l) => [l.avrech.bank?.holder || l.avrech.name.replace(" (דמה)", ""), l.avrech.bank?.idNumber || "", l.avrech.bank?.bankCode || "", l.avrech.bank?.branchCode || "", l.avrech.bank?.account || "", l.total, `מלגה ${month.label}`]),
    ];
    downloadBlob(buildXlsx([{ name: "העברה בנקאית", rows, widths: [24, 12, 6, 8, 14, 12, 22], moneyCols: [5], totalRow: true }]), `העברה בנקאית ${month.label}.xlsx`);
    if (missingBank.length) setMsg({ ok: false, text: `חסרים פרטי בנק ל-${missingBank.length} אברכים: ${missingBank.slice(0, 6).map((l) => l.avrech.name).join(", ")}${missingBank.length > 6 ? "…" : ""}` });
  };

  // קובץ מס״ב - זיכוי ישיר לחשבונות האברכים
  const exportMasav = () => {
    if (!month) return;
    const cfg = s.masav;
    if (!cfg?.institutionCode) {
      setMsg({ ok: false, text: "חסר קוד מוסד למס״ב - ממלאים בהגדרות (כפתור העיפרון למעלה)" });
      setSettingsOpen(true);
      return;
    }
    const when = window.prompt("תאריך זיכוי (יום/חודש/שנה):", new Date(Date.now() + 2 * 864e5).toLocaleDateString("he-IL"));
    if (!when) return;
    const [dd, mm, yy] = when.split(/[./-]/).map(Number);
    const payDate = new Date(yy < 100 ? 2000 + yy : yy, (mm || 1) - 1, dd || 1, 12);
    if (Number.isNaN(payDate.getTime())) return setMsg({ ok: false, text: "תאריך לא תקין" });
    const pay = lines.filter((l) => l.total > 0);
    const ok = pay.filter((l) => l.avrech.bank?.account && l.avrech.bank?.bankCode && l.avrech.bank?.branchCode);
    const bad = pay.filter((l) => !ok.includes(l));
    const r = buildMasav(cfg, ok.map((l) => ({ name: l.avrech.bank?.holder || l.avrech.name.replace(" (דמה)", ""), idNumber: l.avrech.bank?.idNumber || "", bankCode: l.avrech.bank!.bankCode, branchCode: l.avrech.bank!.branchCode, account: l.avrech.bank!.account, amount: l.total, ref: month.label })), payDate);
    downloadBlob(r.blob, `מסב ${month.label}.txt`);
    setMsg({ ok: !bad.length, text: `קובץ מס״ב: ${r.count} מוטבים · ${money(r.total)}${bad.length ? ` · לא נכללו ${bad.length} בלי פרטי בנק: ${bad.slice(0, 5).map((l) => l.avrech.name).join(", ")}${bad.length > 5 ? "…" : ""}` : ""}` });
  };

  const exportMonth = () => {
    if (!month) return;
    downloadBlob(buildXlsx([monthSheet(month.label, lines), branchExpensesSheet(ov, month.label, bx.list ?? [])]), `משכורות ${month.label}.xlsx`);
  };

  const reloadEntries = () => api<{ entries: Entry[] }>(`/api/kollel/entries?month=${encodeURIComponent(key)}`).then((e) => setEntries(e.entries));
  const addException = async (avrechId: string) => {
    try {
      await post("/api/kollel/entries", { avrechId, month: key, type: exForm.type, amount: Number(exForm.amount), description: exForm.description });
      setExForm({ ...exForm, amount: "", description: "" });
      await reloadEntries();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };
  const removeEntry = async (id: string) => {
    if (!window.confirm("למחוק?")) return;
    try {
      await del(`/api/kollel/entries/${id}`);
      await reloadEntries();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
    }
  };

  const exportAll = async () => {
    const all = await api<{ entries: Entry[] }>("/api/kollel/entries?all=1");
    const months = [...ov.months].sort((a, b) => a.order - b.order);
    const docs = await Promise.all(months.map((m) => api<{ month: MonthDoc | null }>(`/api/kollel/months/${encodeURIComponent(m.id)}`)));
    const att = await api<{ sessions: (AttendanceSession & { month: string })[] }>("/api/kollel/attendance").catch(() => ({ sessions: [] }));
    const per = months.map((m, i) => ({ label: m.label, lines: computePayroll(ov.avrechim, docs[i].month, all.entries.filter((e) => e.month === m.id), s, att.sessions.filter((x) => x.month === m.id)) }));
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
        </div>
        <div className="adm-item__actions">
          <button type="button" className="adm-icon-btn adm-icon-btn--ok" onClick={createMonth} aria-label="חודש חדש" title="חודש חדש">
            <Icon name="plus" />
          </button>
          <button type="button" className="adm-icon-btn" onClick={() => setSettingsOpen(true)} aria-label="הגדרות משכורת" title="הגדרות">
            <Icon name="edit" />
          </button>
          <button type="button" className="adm-icon-btn" onClick={exportAll} disabled={!ov.months.length} aria-label="כל החודשים לאקסל" title="כל החודשים לאקסל">
            <Icon name="download" />
          </button>
        </div>
      </div>

      {!ov.months.length ? (
        <div className="adm-panel adm-empty">אין עדיין חודשים. לוחצים "חודש חדש" כדי לפתוח את החודש הנוכחי.</div>
      ) : (
        <>
          <div className="adm-xl-sum">
            <span className={`adm-xl-sum__st${locked ? " is-locked" : ""}`}>
              <Icon name={locked ? "lock" : "edit"} width={14} height={14} /> {month?.label || key} · {locked ? "סגור" : "פתוח"}
            </span>
            <span><strong>{money(total)}</strong> לתשלום</span>
            <span><strong>{lines.length}</strong> אברכים</span>
            <button type="button" className={`adm-xl-sum__miss${onlyMissing ? " is-on" : ""}`} onClick={() => setOnlyMissing(!onlyMissing)}>
              <strong>{missing.length}</strong> לא נבדקו
            </button>
            {stage && stage.cities.length ? (
              <span title={stage.cities.filter((c) => !c.approved).map((c) => c.name).join(", ")}>
                ערים אישרו <strong>{stage.cities.filter((c) => c.approved).length}/{stage.cities.length}</strong>
              </span>
            ) : null}
          </div>

          <div className="adm-table-wrap adm-xl-wrap">
            <table className="adm-table adm-pay adm-xl">
              <thead>
                <tr>
                  <th scope="col">נבדק</th>
                  <th scope="col">שם</th>
                  <th scope="col">בסיס</th>
                  <th scope="col">נסיעות</th>
                  <th scope="col">חריגים</th>
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
                    const own = entries.filter((e) => e.avrechId === l.avrech.id);
                    const isOpen = exOpen === l.avrech.id;
                    return [
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
                        <td>
                          <button type="button" className={`adm-pay-ex${isOpen ? " is-on" : ""}`} onClick={() => setExOpen(isOpen ? null : l.avrech.id)} aria-label={`חריגים ל${l.avrech.name}`} aria-expanded={isOpen}>
                            {own.length ? <strong>{own.length}</strong> : <Icon name="plus" width={16} height={16} />}
                          </button>
                        </td>
                        <td className="detail">
                          {l.attendance ? (
                            <span className={`adm-attpill${l.attendance.came < l.attendance.total ? " is-miss" : ""}`} title="נוכחות בחודש">
                              <Icon name="calendar" width={13} height={13} /> {l.attendance.came}/{l.attendance.total}
                            </span>
                          ) : null}
                          {l.detail || (l.attendance ? null : <span className="muted">-</span>)}
                        </td>
                        <td style={{ whiteSpace: "nowrap", fontWeight: 800 }}>{money(l.total)}</td>
                      </tr>,
                      isOpen ? (
                        <tr key={`${l.avrech.id}:ex`} className="adm-pay-exrow">
                          <td colSpan={7}>
                            <div className="adm-pay-exbox">
                            {own.map((e) => (
                              <span key={e.id} className={`adm-pay-exchip${e.amount < 0 ? " is-neg" : ""}`}>
                                {ENTRY_LABELS[e.type]}
                                {e.description ? ` · ${e.description}` : ""} <strong>{money(e.amount)}</strong>
                                {!locked ? (
                                  <button type="button" aria-label="מחיקה" onClick={() => removeEntry(e.id)}>
                                    ✕
                                  </button>
                                ) : null}
                              </span>
                            ))}
                            {!locked ? (
                              <div className="adm-pay-exform">
                                <Chips<EntryType>
                                  value={exForm.type}
                                  onChange={(type) => setExForm({ ...exForm, type })}
                                  items={(["travel", "other", "deduction", "bonus", "grant"] as EntryType[]).map((t) => ({ id: t, label: t === "travel" ? "נסיעות" : t === "other" ? "זכות +" : t === "deduction" ? "חובה −" : ENTRY_LABELS[t] }))}
                                />
                                <div className="adm-bx__row">
                                  <input className="input" type="number" inputMode="decimal" placeholder={exForm.type === "deduction" ? "₪ לחיוב" : "₪"} value={exForm.amount} onChange={(e) => setExForm({ ...exForm, amount: e.target.value })} aria-label="סכום" />
                                  <input className="input" placeholder="פירוט" value={exForm.description} onChange={(e) => setExForm({ ...exForm, description: e.target.value })} aria-label="פירוט" />
                                  <button type="button" className="adm-icon-btn adm-icon-btn--ok" aria-label="הוספה" disabled={!Number(exForm.amount)} onClick={() => addException(l.avrech.id)}>
                                    <Icon name="check" />
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td>סה״כ</td>
                  <td colSpan={4}>{lines.length} אברכים</td>
                  <td style={{ whiteSpace: "nowrap" }}>{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted" style={{ fontSize: "0.88rem" }}>
            בסיס ריק = מלא. נסיעות ריקות = הסכום הקבוע של האברך. "חריגים" = תוספת נסיעות, בונוס, מענק, שונות או הורדה לחודש הזה. הוצאות הסניף - בנפרד למטה.
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
                {!locked ? (
                  <Combo
                    label="הוספת אברך לחודש"
                    value=""
                    onChange={(id) => {
                      if (!month || !id) return;
                      setMonth({ ...month, extraIds: [...month.extraIds, id] });
                      setDirty(true);
                    }}
                    options={nonMembers.map((a) => ({ id: a.id, label: a.name }))}
                  />
                ) : null}
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

          {key ? <BranchExpenses ov={ov} month={key} locked={locked} /> : null}

          <div className="adm-savebar">
            <span>
              <strong>{money(total)}</strong> · {dirty ? "יש שינויים שלא נשמרו" : msg?.text ?? (locked ? "החודש סגור לתשלום" : "הכל שמור")}
            </span>
            <div className="btn-row">
              <button type="button" className="btn btn--light btn--sm" onClick={exportMonth}>
                <Icon name="download" /> אקסל
              </button>
              <button type="button" className="btn btn--light btn--sm" onClick={exportMasav} title="קובץ זיכויים למס״ב">
                <Icon name="download" /> מס״ב
              </button>
              <button type="button" className="btn btn--light btn--sm" onClick={exportBank} title="רשימת העברות באקסל">
                <Icon name="download" /> לבנק
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
                      const notApproved = (stage?.cities ?? []).filter((c) => !c.approved).map((c) => c.name);
                      if (notApproved.length && !window.confirm(`ערים שעוד לא אישרו: ${notApproved.join(", ")}. לסגור בכל זאת?`)) return;
                      saveMonth({ ...month, locked: true }, "החודש נסגר לתשלום");
                    }}
                  >
                    <Icon name="lock" /> סגירה
                  </button>
                </>
              ) : privileged ? (
                <button type="button" className="btn btn--light btn--sm" onClick={() => month && window.confirm("לפתוח את החודש לעריכה?") && saveMonth({ ...month, locked: false }, "החודש נפתח לעריכה")}>
                  <Icon name="lock" /> פתיחה
                </button>
              ) : null}
            </div>
          </div>
          {msg && !msg.ok ? <div className="adm-alert adm-alert--error">{msg.text}</div> : null}
        </>
      )}

      <div className="adm-xl-tabs" role="tablist" aria-label="חודשים" style={tabsPos}>
        <select className="adm-xl-tabs__year" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="שנה">
          {Array.from(new Set([hebrewYearNum() + 1, hebrewYearNum(), ...ov.months.map((m) => yearNumOf(m.label)).filter(Boolean), hebrewYearNum() - 1, hebrewYearNum() - 2]))
            .sort((a, b) => b - a)
            .map((y) => (
              <option key={y} value={y}>
                {hebrewYearLabel(y)}
              </option>
            ))}
        </select>
        <div className="adm-xl-tabs__list">
          {hebrewYearMonthLabels(year).map((label) => {
            const m = ov.months.find((x) => x.id === label || x.label === label);
            return (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={m ? key === m.id : false}
                className={`adm-xl-tab${m && key === m.id ? " is-on" : ""}${!m ? " is-empty" : ""}${m?.locked ? " is-locked" : ""}`}
                onClick={async () => {
                  if (dirty && !window.confirm("יש שינויים שלא נשמרו. לעבור בכל זאת?")) return;
                  if (m) return setKey(m.id);
                  if (!window.confirm(`לפתוח את ${label}?`)) return;
                  await put(`/api/kollel/months/${encodeURIComponent(label)}`, emptyMonth(label));
                  await loadOv();
                  setKey(label);
                }}
              >
                {m?.locked ? <Icon name="lock" width={11} height={11} /> : null}
                {label.replace(` ${yearOfMonthLabel(label)}`, "")}
              </button>
            );
          })}
          {ov.months
            .filter((m) => yearNumOf(m.label) === year && !hebrewYearMonthLabels(year).includes(m.label))
            .map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={key === m.id} className={`adm-xl-tab${key === m.id ? " is-on" : ""}`} onClick={() => setKey(m.id)}>
                {m.label}
              </button>
            ))}
        </div>
      </div>

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
            <Icon name="gift" width={18} height={18} style={{ verticalAlign: "-3px", color: "var(--flame)" }} /> {name(x.celebrantId)} - {x.note || SIMCHA_LABELS[x.type]}
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
          <div className="field">
            <span className="field__label">בעל השמחה</span>
            <Combo label="בעל השמחה" value={form.celebrantId} onChange={(celebrantId) => setForm({ ...form, celebrantId })} options={lines.map((l) => ({ id: l.avrech.id, label: l.avrech.name }))} />
          </div>
          <div className="field">
            <span className="field__label">סוג</span>
            <Chips<Simcha["type"]>
              value={form.type}
              onChange={(type) => setForm({ ...form, type })}
              items={[
                { id: "bat", label: `בת · ${settings.simchaRates.bat}₪` },
                { id: "ben", label: `בן · ${settings.simchaRates.ben}₪` },
                { id: "barmitzva", label: `בר מצווה · ${settings.simchaRates.barmitzva}₪` },
              ]}
            />
          </div>
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
          <label className="field span-2">
            <span className="field__label">הורדה ליום היעדרות (₪)</span>
            <input className="input" type="number" value={s.absenceRate ?? 0} onChange={(e) => setS({ ...s, absenceRate: Number(e.target.value) })} />
            <span className="field__hint">0 = בלי הורדה. ההורדה מחושבת לפי מפגשים שסומנו בלשונית "נוכחות".</span>
          </label>
          <h3 className="span-2" style={{ margin: "8px 0 0" }}>מס״ב</h3>
          <label className="field">
            <span className="field__label">קוד מוסד (8 ספרות)</span>
            <input className="input" inputMode="numeric" dir="ltr" value={s.masav?.institutionCode ?? ""} onChange={(e) => setS({ ...s, masav: { institutionCode: e.target.value, senderCode: s.masav?.senderCode ?? "", institutionName: s.masav?.institutionName ?? "" } })} />
          </label>
          <label className="field">
            <span className="field__label">קוד מוסד שולח (5 ספרות)</span>
            <input className="input" inputMode="numeric" dir="ltr" value={s.masav?.senderCode ?? ""} onChange={(e) => setS({ ...s, masav: { institutionCode: s.masav?.institutionCode ?? "", senderCode: e.target.value, institutionName: s.masav?.institutionName ?? "" } })} />
          </label>
          <label className="field span-2">
            <span className="field__label">שם המוסד</span>
            <input className="input" value={s.masav?.institutionName ?? ""} onChange={(e) => setS({ ...s, masav: { institutionCode: s.masav?.institutionCode ?? "", senderCode: s.masav?.senderCode ?? "", institutionName: e.target.value } })} />
            <span className="field__hint">את הקודים מקבלים מהבנק כשפותחים הסכם מס״ב.</span>
          </label>
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
