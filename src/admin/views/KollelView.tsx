/** כולל ערב: אברכים לפי ערים וסניפים, דיווח נסיעות והוצאות */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { apiCached, api, del, post, put, type Me, type OrgUnit } from "../api";
import { Chips, Combo, ContactActions, ExportBtn, Fab, money, ToneLegend, waLink } from "../components";
import { computePayroll, ENTRY_LABELS, type Avrech, type Entry, type EntryType, type KollelSettings } from "../kollelCalc";
import { buildXlsx, downloadBlob, parsePasted } from "../xlsx";
import { useLive } from "../live";
import { MitchPanel, type Mitch } from "./MitchView";
import { SheetTable } from "../SheetTable";
import { BranchExpenses } from "./BranchExpenses";

export type Overview = {
  me: { manager: boolean; canEditAvrechim: boolean; canPayroll: boolean };
  avrechim: Avrech[];
  cities: OrgUnit[];
  branches: OrgUnit[];
  settings: KollelSettings;
  months: { id: string; label: string; locked: boolean; order: number }[];
};

type Tab = "avrechim" | "mitch" | "entries" | "attendance";

const blankAvrech = (branchId: string | null): Avrech => ({ id: "", name: "", phone: "", email: "", branchId, monthlyTravel: 0, inPayroll: true, simchaFund: true, simchaExternal: false, active: true, notes: "" });

const filterFromTab = (t?: string): AvFilter | undefined => {
  const f = t?.split(":")[1];
  return f === "nophone" || f === "nobranch" || f === "inactive" ? f : undefined;
};

/** "סניף רמות (ירושלים)" */
export function branchLabel(ov: Pick<Overview, "cities" | "branches">, id: string | null | undefined) {
  const b = ov.branches.find((x) => x.id === id);
  if (!b) return "ללא סניף";
  const c = ov.cities.find((x) => x.id === b.parentId);
  return `${b.name}${c ? ` (${c.name})` : ""}`;
}

export function KollelView({ me, go, initialTab }: { me: Me; go?: (v: "org") => void; initialTab?: string }) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab?.startsWith("entries") ? "entries" : initialTab === "attendance" ? "attendance" : initialTab?.startsWith("mitch") ? "mitch" : "avrechim");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => apiCached<Overview>("/api/kollel/overview", setOv).catch((e) => setErr(e.message)), []);
  useLive(["avrechim", "kollelMonths", "orgUnits", "kollelSettings"], load);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!ov) return <p className="muted">טוען…</p>;
  const manager = ov.me.manager;
  const scopeLine = manager
    ? `כל הסניפים · ${ov.avrechim.filter((a) => a.active).length} אברכים פעילים`
    : ov.me.canEditAvrechim
      ? ov.cities.map((c) => c.name).join(", ") || "ללא שיוך עיר"
      : ov.branches.map((b) => branchLabel(ov, b.id)).join(", ") || "ללא שיוך סניף";

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>כולל ערב</h1>
          <span className="adm-scope-chip"><Icon name="pin" width={14} height={14} /> {scopeLine}</span>
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
          <Icon name="file" width={16} height={16} /> דיווחים
        </button>
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "mitch"} onClick={() => setTab("mitch")}>
          <Icon name="heart" width={16} height={16} /> מתחזקים
        </button>
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "attendance"} onClick={() => setTab("attendance")}>
          <Icon name="calendar" width={16} height={16} /> ערב לימוד
        </button>
      </div>
      {tab === "avrechim" ? <AvrechimTab ov={ov} reload={load} initialFilter={filterFromTab(initialTab)} initialQ={initialTab?.startsWith("avrechim:q:") ? initialTab.slice(11) : ""} /> : null}
      {tab === "entries" ? <EntriesTab ov={ov} /> : null}
      {tab === "attendance" ? <AttendanceTab ov={ov} /> : null}
      {tab === "mitch" ? <MitchPanel domain="kollel" initialTab={initialTab} initialQ={initialTab?.startsWith("mitch:q:") ? initialTab.slice(8) : ""} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ אברכים */

type AvFilter = "active" | "nophone" | "nobranch" | "inactive";

function AvrechimTab({ ov, reload, initialFilter, initialQ = "" }: { ov: Overview; reload: () => void; initialFilter?: AvFilter; initialQ?: string }) {
  const manager = ov.me.manager;
  const canEdit = ov.me.canEditAvrechim;
  const [q, setQ] = useState(initialQ);
  const [filter, setFilter] = useState<AvFilter>(initialFilter ?? "active");
  const [branch, setBranch] = useState<string>("all");
  const [sel, setSel] = useState<Avrech | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const known = new Set(ov.branches.map((b) => b.id));
  const noBranch = (a: Avrech) => !a.branchId || !known.has(a.branchId);
  const test: Record<AvFilter, (a: Avrech) => boolean> = {
    active: (a) => a.active,
    nophone: (a) => a.active && !a.phone,
    nobranch: (a) => a.active && noBranch(a),
    inactive: (a) => !a.active,
  };
  const list = ov.avrechim.filter((a) => test[filter](a) && (branch === "all" || a.branchId === branch) && (!q.trim() || `${a.name} ${a.phone}`.includes(q.trim())));
  const toneOf = (a: Avrech) => (!a.active ? "grey" : !a.phone || noBranch(a) ? "yellow" : "green") as "grey" | "yellow" | "green";
  const exportXlsx = () => {
    const rows = [["שם", "טלפון", "סניף", "נסיעות חודשיות", "פעיל"], ...list.map((a) => [a.name, a.phone, branchLabel(ov, a.branchId), a.monthlyTravel || 0, a.active ? "כן" : "לא"])];
    downloadBlob(buildXlsx([{ name: "אברכים", rows, widths: [24, 16, 26, 16, 8], moneyCols: [3] }]), "אברכים.xlsx");
  };

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
        <input className="input adm-search" type="search" placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש אברך" />
        <ExportBtn onClick={exportXlsx} />
        {manager ? (
          <button type="button" className="adm-icon-btn" onClick={() => setImporting(true)} aria-label="ייבוא מאקסל" title="ייבוא מאקסל">
            <Icon name="arrowUp" />
          </button>
        ) : null}
      </div>
      <Chips<AvFilter>
        value={filter}
        onChange={setFilter}
        items={[
          { id: "active", label: "פעילים", count: ov.avrechim.filter(test.active).length },
          { id: "nophone", label: "חסר טלפון", count: ov.avrechim.filter(test.nophone).length },
          { id: "nobranch", label: "ללא סניף", count: ov.avrechim.filter(test.nobranch).length },
          { id: "inactive", label: "לא פעילים", count: ov.avrechim.filter(test.inactive).length },
        ]}
      />
      {ov.branches.length > 1 ? (
        <Chips<string>
          value={branch}
          onChange={setBranch}
          items={[{ id: "all", label: "כל הסניפים" }, ...ov.branches.map((b) => ({ id: b.id, label: b.name }))]}
        />
      ) : null}
      <ToneLegend
        items={[
          { tone: "green", label: "תקין" },
          { tone: "yellow", label: "חסר טלפון / סניף" },
          { tone: "grey", label: "לא פעיל" },
        ]}
      />
      {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`} style={{ marginBottom: 10 }}>{msg.text}</div> : null}

      <div className="adm-split">
        <div>
          <SheetTable<Avrech>
            id="avrechim"
            rows={list}
            rowKey={(a) => a.id}
            current={sel?.id}
            onRow={(a) => setSel({ ...a })}
            exportName="אברכים"
            tone={toneOf}
            empty="אין אברכים להצגה"
            cols={[
              { key: "name", label: "שם", fixed: true, width: 140, cell: (a) => a.name, value: (a) => a.name },
              { key: "act", label: "", width: 70, cell: (a) => a.phone ? (
                <span className="adm-sheet__mini">
                  <a className="adm-ia--wa" href={waLink(a.phone, `שלום ${a.name}, `)} target="_blank" rel="noopener noreferrer" aria-label="וואטסאפ"><Icon name="whatsapp" /></a>
                  <a className="adm-ia--call" href={`tel:${a.phone}`} aria-label="חיוג"><Icon name="phone" /></a>
                </span>
              ) : null },
              { key: "phone", label: "טלפון", width: 100, cell: (a) => (a.phone ? <span dir="ltr">{a.phone}</span> : <span className="adm-sheet__tag adm-sheet__tag--yellow">חסר</span>), value: (a) => a.phone || "" },
              { key: "city", label: "עיר", width: 90, cell: (a) => ov.cities.find((c) => c.id === ov.branches.find((b) => b.id === a.branchId)?.parentId)?.name || "", value: (a) => ov.cities.find((c) => c.id === ov.branches.find((b) => b.id === a.branchId)?.parentId)?.name || "" },
              { key: "branch", label: "סניף", width: 90, cell: (a) => (noBranch(a) ? <span className="adm-sheet__tag adm-sheet__tag--yellow">ללא</span> : ov.branches.find((b) => b.id === a.branchId)?.name), value: (a) => ov.branches.find((b) => b.id === a.branchId)?.name || "" },
              { key: "travel", label: "נסיעות חודשיות", width: 100, cell: (a) => (a.monthlyTravel ? money(a.monthlyTravel) : "—"), value: (a) => a.monthlyTravel || 0 },
              ...(manager ? [{ key: "payroll", label: "במשכורות", width: 80, cell: (a: Avrech) => (a.inPayroll ? "✓" : <span className="adm-sheet__tag adm-sheet__tag--yellow">לא</span>), value: (a: Avrech) => (a.inPayroll ? "כן" : "לא") }] : []),
              { key: "active", label: "סטטוס", width: 70, cell: (a) => (a.active ? "פעיל" : "לא פעיל"), value: (a) => (a.active ? "פעיל" : "לא פעיל") },
            ]}
          />
          {!list.length && !ov.avrechim.length ? <div className="adm-panel adm-empty">אין אברכים{canEdit ? ". אפשר להוסיף" + (manager ? " או לייבא מאקסל." : ".") : " בסניף שלך עדיין."}</div> : null}
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
                  <div className="field">
                    <span className="field__label">סניף</span>
                    <Combo
                      label="סניף"
                      value={sel.branchId ?? ""}
                      onChange={(id) => setSel({ ...sel, branchId: id || null })}
                      options={[...(manager ? [{ id: "", label: "ללא סניף" }] : []), ...ov.branches.map((b) => ({ id: b.id, label: b.name, sub: ov.cities.find((c) => c.id === b.parentId)?.name }))]}
                    />
                    {!ov.branches.length ? <span className="field__hint">אין עדיין סניפים. מוסיפים במסך "ערים, סניפים ורכזים".</span> : null}
                  </div>
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
                  {manager ? <BankFields value={sel.bank ?? null} onChange={(bank) => setSel({ ...sel, bank })} /> : null}
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
            {sel.id && manager ? <AvrechFiles key={`f-${sel.id}`} av={sel} /> : null}
            {sel.id ? <AvrechHistory key={sel.id} ov={ov} av={sel} /> : null}
          </section>
        ) : (
          <div className="adm-panel adm-empty adm-detail-empty">
            <Icon name="eye" />
            בחרו אברך לפרטים
          </div>
        )}
      </div>

      {importing ? <ImportModal ov={ov} onClose={() => setImporting(false)} onDone={reload} /> : null}
      {canEdit && !sel ? <Fab label="הוספת אברך" onClick={() => setSel(blankAvrech(branch !== "all" ? branch : ov.branches.length === 1 ? ov.branches[0].id : null))} /> : null}
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

const STEP = 50;

function EntriesTab({ ov }: { ov: Overview }) {
  const manager = ov.me.manager;
  const open = ov.months.filter((m) => !m.locked);
  const [month, setMonth] = useState<string>(open[0]?.id ?? ov.months[0]?.id ?? "");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [full, setFull] = useState(false);
  const [form, setForm] = useState<{ avrechId: string; type: EntryType; amount: string; description: string }>({ avrechId: "", type: "bonus", amount: "", description: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const locked = ov.months.find((m) => m.id === month)?.locked ?? false;
  const avs = ov.avrechim.filter((a) => a.active && (!q.trim() || a.name.includes(q.trim())));

  const load = useCallback(() => {
    if (!month) return;
    api<{ entries: Entry[] }>(`/api/kollel/entries?month=${encodeURIComponent(month)}`).then((r) => setEntries(r.entries));
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["kollelEntries"], load);

  if (!ov.months.length) {
    return <div className="adm-panel adm-empty">עדיין לא נפתח חודש. הרכז הראשי פותח חודש חדש במסך "משכורות".</div>;
  }

  const send = async (body: { avrechId: string; type: EntryType; amount: number; description: string }) => {
    setMsg(null);
    try {
      await post("/api/kollel/entries", { ...body, month });
      if (navigator.vibrate) navigator.vibrate(10);
      load();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "שגיאה" });
      return false;
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
  const sumFor = (id: string, types?: EntryType[]) => (entries ?? []).filter((e) => e.avrechId === id && (!types || types.includes(e.type))).reduce((t, e) => t + e.amount, 0);
  const total = (entries ?? []).reduce((t, e) => t + e.amount, 0);
  const exportXlsx = () => {
    const label = ov.months.find((m) => m.id === month)?.label ?? month;
    const rows = [["אברך", "סוג", "סכום", "פירוט", "דווח ע״י"], ...(entries ?? []).map((e) => [name(e.avrechId), ENTRY_LABELS[e.type], e.amount, e.description, e.byName])];
    downloadBlob(buildXlsx([{ name: label.slice(0, 30), rows, widths: [22, 14, 12, 30, 18], moneyCols: [2], totalRow: true }]), `דיווחים ${label}.xlsx`);
  };

  return (
    <>
      <Chips<string> value={month} onChange={setMonth} items={ov.months.map((m) => ({ id: m.id, label: `${m.locked ? "🔒 " : ""}${m.label}` }))} />
      {msg ? <div className={`adm-alert ${msg.ok ? "adm-alert--ok" : "adm-alert--error"}`} style={{ marginBottom: 10 }}>{msg.text}</div> : null}
      {locked ? (
        <div className="adm-alert adm-alert--info" style={{ marginBottom: 14 }}>
          <Icon name="lock" width={16} height={16} style={{ verticalAlign: "-3px" }} /> החודש סגור לתשלום
        </div>
      ) : null}
      <MonthStatus ov={ov} month={month} locked={locked} />

      {!locked ? (
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>נסיעות · דיווח מהיר</h2>
            <input className="input adm-search" type="search" placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש אברך" style={{ maxWidth: 180 }} />
          </div>
          <div className="adm-quick">
            {avs.map((a) => {
              const t = sumFor(a.id);
              return (
                <div key={a.id} className="adm-quick__row">
                  <div className="adm-quick__name">
                    <strong>{a.name}</strong>
                    <small className={t < 0 ? "is-neg" : t > 0 ? "is-pos" : ""}>{t ? money(t) : "ללא שינוי"}</small>
                  </div>
                  <button type="button" className="adm-qbtn adm-qbtn--plus" dir="ltr" aria-label={`תוספת ${STEP} ש״ח ל${a.name}`} onClick={() => send({ avrechId: a.id, type: "travel", amount: STEP, description: "תוספת נסיעות" })}>
                    +{STEP}
                  </button>
                  <button type="button" className="adm-qbtn adm-qbtn--minus" dir="ltr" aria-label={`הפחתה ${STEP} ש״ח ל${a.name}`} onClick={() => send({ avrechId: a.id, type: "travel", amount: -STEP, description: "הפחתת נסיעות" })}>
                    −{STEP}
                  </button>
                </div>
              );
            })}
            {!avs.length ? <p className="muted">אין אברכים.</p> : null}
          </div>
          {manager ? (
            <>
              <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} onClick={() => setFull(!full)}>
                <Icon name={full ? "arrowUp" : "plus"} /> חריגים: מענק, בונוס, שונות או הורדה
              </button>
              {full ? (
                <div className="adm-fields adm-fields--2" style={{ marginTop: 10 }}>
                  <div className="field">
                    <span className="field__label">אברך</span>
                    <Combo label="אברך" value={form.avrechId} onChange={(avrechId) => setForm({ ...form, avrechId })} options={ov.avrechim.filter((a) => a.active).map((a) => ({ id: a.id, label: a.name, sub: branchLabel(ov, a.branchId) }))} />
                  </div>
                  <div className="field">
                    <span className="field__label">סוג</span>
                    <Chips<EntryType> value={form.type} onChange={(type) => setForm({ ...form, type })} items={(["bonus", "grant", "other", "deduction"] as EntryType[]).map((t) => ({ id: t, label: ENTRY_LABELS[t] }))} />
                  </div>
                  <label className="field">
                    <span className="field__label">סכום (₪)</span>
                    <input className="input" type="number" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field__label">פירוט</span>
                    <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </label>
                  <div className="span-2">
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={!form.avrechId || !Number(form.amount)}
                      onClick={async () => {
                        if (await send({ avrechId: form.avrechId, type: form.type, amount: Number(form.amount), description: form.description })) {
                          setForm({ ...form, amount: "", description: "" });
                          setMsg({ ok: true, text: "נשמר" });
                        }
                      }}
                    >
                      <Icon name="check" /> שמירה
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <BranchExpenses ov={ov} month={month} locked={locked} />

      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>
            דיווחים בחודש <span className="muted">({(entries ?? []).length})</span>
          </h2>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>{money(total)}</strong>
            <ExportBtn onClick={exportXlsx} />
          </span>
        </div>
        <div className="adm-list">
          {(entries ?? []).map((e) => (
            <div key={e.id} className={`adm-row adm-row--tone-${e.amount < 0 ? "red" : "green"}`} style={{ cursor: "default" }}>
              <span className="adm-row__title">{name(e.avrechId)}</span>
              <span className="adm-item__actions">
                <strong style={{ whiteSpace: "nowrap", color: e.amount < 0 ? "#b3261e" : undefined }}>{money(e.amount)}</strong>
                {!locked ? (
                  <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label="מחיקת דיווח" onClick={() => remove(e.id)}>
                    <Icon name="trash" />
                  </button>
                ) : null}
              </span>
              <span className="adm-row__sub">
                {ENTRY_LABELS[e.type]}
                {e.description ? ` · ${e.description}` : ""} · {e.byName}
              </span>
            </div>
          ))}
        </div>
        {entries && !entries.length ? <p className="muted">אין דיווחים בחודש הזה.</p> : null}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ נוכחות */

export type Session = { id: string; branchId: string; date: string; month: string; present: string[]; mPresent?: string[]; notes?: Record<string, string>; byName: string };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabel = (iso: string) => new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "numeric" }).format(new Date(`${iso}T12:00:00`));

function AttendanceTab({ ov }: { ov: Overview }) {
  const open = ov.months.filter((m) => !m.locked);
  const [month, setMonth] = useState<string>(open[0]?.id ?? ov.months[0]?.id ?? "");
  const [branch, setBranch] = useState<string>(ov.branches[0]?.id ?? "");
  const [date, setDate] = useState(today());
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [mitch, setMitch] = useState<Mitch[]>([]);
  const loadMitch = useCallback(() => api<{ mitch: Mitch[] }>("/api/mitch?domain=kollel").then((r) => setMitch(r.mitch.filter((m) => m.status === "active"))).catch(() => undefined), []);
  useEffect(() => {
    loadMitch();
  }, [loadMitch]);
  useLive(["mitchazkim"], loadMitch);
  const [msg, setMsg] = useState<string | null>(null);
  const locked = ov.months.find((m) => m.id === month)?.locked ?? false;

  const load = useCallback(() => {
    if (!month) return;
    api<{ sessions: Session[] }>(`/api/kollel/attendance?month=${encodeURIComponent(month)}`).then((r) => setSessions(r.sessions));
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["kollelAttendance"], load);
  // שליחת סימונים שנשמרו בלי חיבור
  useEffect(() => {
    const flush = () => flushAttendance().then((n) => n && (setMsg(null), load()));
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [load]);

  if (!ov.months.length) return <div className="adm-panel adm-empty">עדיין לא נפתח חודש. הרכז הראשי פותח חודש במסך "משכורות".</div>;
  if (!ov.branches.length) return <div className="adm-panel adm-empty">אין סניפים. נוכחות מסמנים לפי סניף.</div>;

  const avs = ov.avrechim.filter((a) => a.active && a.branchId === branch);
  const branchSessions = (sessions ?? []).filter((x) => x.branchId === branch).sort((a, b) => b.date.localeCompare(a.date));
  const cur = branchSessions.find((x) => x.date === date);
  const present = new Set(cur?.present ?? []);

  const save = async (next: string[], extra: { mPresent?: string[]; notes?: Record<string, string> } = {}) => {
    setMsg(null);
    const mPresent = extra.mPresent ?? cur?.mPresent ?? [];
    const notes = extra.notes ?? cur?.notes ?? {};
    // עדכון מיידי במסך, ואז שמירה
    setSessions((list) => {
      const rest = (list ?? []).filter((x) => !(x.branchId === branch && x.date === date));
      return [...rest, { id: `${branch}_${date}`, branchId: branch, date, month, present: next, mPresent, notes, byName: "" }];
    });
    const body = { branchId: branch, date, month, present: next, mPresent, notes };
    try {
      await put("/api/kollel/attendance", body);
    } catch (e) {
      if (e instanceof TypeError || !navigator.onLine) {
        // אין קליטה - שומרים במכשיר ושולחים כשהחיבור חוזר
        queueAttendance(body);
        setMsg("אין חיבור כרגע. הסימון נשמר במכשיר ויישלח לבד כשהקליטה תחזור.");
        return;
      }
      setMsg(e instanceof Error ? e.message : "שגיאה");
      load();
    }
  };
  const toggle = (id: string) => save(present.has(id) ? [...present].filter((x) => x !== id) : [...present, id]);
  // מתחזק שהגיע - האברך שלו מסומן אוטומטית כנוכח
  const mHere = new Set(cur?.mPresent ?? []);
  const toggleM = (m: Mitch) => {
    const on = mHere.has(m.id);
    const mPresent = on ? [...mHere].filter((x) => x !== m.id) : [...mHere, m.id];
    const nextPresent = !on && m.avrechId && !present.has(m.avrechId) ? [...present, m.avrechId] : [...present];
    save(nextPresent, { mPresent });
  };
  const editNote = (avrechId: string, name: string) => {
    const v = window.prompt(`מה למדו היום (${name})?`, cur?.notes?.[avrechId] ?? "");
    if (v === null) return;
    save([...present], { notes: { ...(cur?.notes ?? {}), [avrechId]: v } });
  };
  const removeSession = async () => {
    if (!cur || !window.confirm(`למחוק את המפגש של ${dayLabel(date)}?`)) return;
    await del(`/api/kollel/attendance/${cur.id}`).catch((e) => setMsg(e.message));
    load();
  };

  const stats = (id: string) => ({ total: branchSessions.length, came: branchSessions.filter((x) => x.present.includes(id)).length });
  const exportXlsx = () => {
    const dates = [...branchSessions].reverse();
    const rows = [["אברך", ...dates.map((d) => dayLabel(d.date)), "נכח", "מתוך"], ...avs.map((a) => [a.name, ...dates.map((d) => (d.present.includes(a.id) ? "✓" : "✗")), stats(a.id).came, stats(a.id).total])];
    const label = ov.months.find((m) => m.id === month)?.label ?? month;
    downloadBlob(buildXlsx([{ name: "נוכחות", rows, widths: [22, ...dates.map(() => 10), 8, 8] }]), `נוכחות ${branchLabel(ov, branch)} ${label}.xlsx`);
  };

  return (
    <>
      <Chips<string> value={month} onChange={setMonth} items={ov.months.map((m) => ({ id: m.id, label: `${m.locked ? "🔒 " : ""}${m.label}` }))} />
      {ov.branches.length > 1 ? <Chips<string> value={branch} onChange={setBranch} items={ov.branches.map((b) => ({ id: b.id, label: b.name }))} /> : null}
      {msg ? <div className="adm-alert adm-alert--error">{msg}</div> : null}

      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>
            <Icon name="calendar" width={20} height={20} style={{ verticalAlign: "-4px" }} /> {dayLabel(date)}
          </h2>
          <span className="adm-item__actions">
            <input className="input adm-date" type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="תאריך" />
            {cur && !locked ? (
              <button type="button" className="adm-icon-btn adm-icon-btn--danger" onClick={removeSession} aria-label="מחיקת המפגש" title="מחיקת המפגש">
                <Icon name="trash" />
              </button>
            ) : null}
          </span>
        </div>
        {!locked ? (
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button type="button" className="btn btn--sm" onClick={() => save(avs.map((a) => a.id))}>
              <Icon name="checkCircle" /> כולם הגיעו
            </button>
            {cur ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => save([])}>
                ניקוי
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="adm-att">
          {avs.map((a) => {
            const on = present.has(a.id);
            const st = stats(a.id);
            const mine = mitch.filter((m) => m.avrechId === a.id);
            const note = cur?.notes?.[a.id];
            return (
              <div key={a.id} className="adm-att__card">
                <button type="button" className={`adm-att__btn${on ? " is-on" : cur ? " is-off" : ""}`} disabled={locked} onClick={() => toggle(a.id)} aria-pressed={on}>
                  <span className="adm-att__mark">
                    <Icon name={on ? "check" : "close"} />
                  </span>
                  <span className="adm-att__name">{a.name}</span>
                  <small>
                    {st.came}/{st.total}
                  </small>
                </button>
                {mine.length || on ? (
                  <div className="adm-att__mitch">
                    {mine.map((m) => (
                      <button key={m.id} type="button" className={`adm-chip${mHere.has(m.id) ? " is-here" : ""}`} aria-pressed={mHere.has(m.id)} disabled={locked} onClick={() => toggleM(m)} title="מתחזק שלומד איתו">
                        <Icon name={mHere.has(m.id) ? "check" : "users"} width={14} height={14} /> {m.name}
                      </button>
                    ))}
                    {on && !locked ? (
                      <button type="button" className="adm-chip" onClick={() => editNote(a.id, a.name)} title="מה למדו">
                        <Icon name="edit" width={14} height={14} /> {note ? note.slice(0, 24) : "מה למדו"}
                      </button>
                    ) : note ? (
                      <span className="muted" style={{ fontSize: "0.82rem" }}>{note}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!avs.length ? <p className="muted">אין אברכים בסניף הזה.</p> : null}
        </div>
        {!cur && avs.length && !locked ? <p className="muted" style={{ marginBottom: 0 }}>לחיצה על אברך מסמנת שהגיע. המפגש נשמר מיד.</p> : null}
      </section>

      <section className="adm-panel">
        <div className="adm-panel__head">
          <h2>
            מפגשים בחודש <span className="muted">({branchSessions.length})</span>
          </h2>
          <ExportBtn onClick={exportXlsx} />
        </div>
        <div className="adm-chips" style={{ flexWrap: "wrap" }}>
          {branchSessions.map((x) => (
            <button key={x.id} type="button" className="adm-chip" aria-pressed={x.date === date} onClick={() => setDate(x.date)}>
              {dayLabel(x.date)} <span className="adm-chip__n">{x.present.length}</span>
            </button>
          ))}
          {!branchSessions.length ? <p className="muted">עדיין לא סומנה נוכחות בחודש הזה.</p> : null}
        </div>
      </section>
      {ov.me.manager ? <ReminderSettings /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ כרטיס אברך: היסטוריה */

type History = {
  months: { id: string; label: string; locked: boolean; order: number; doc?: import("../kollelCalc").MonthDoc }[];
  entries: Entry[];
  sessions: (Session & { month: string })[];
};

function AvrechHistory({ ov, av }: { ov: Overview; av: Avrech }) {
  const [h, setH] = useState<History | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api<History>(`/api/kollel/avrechim/${av.id}/history`).then(setH).catch(() => setH(null));
  }, [av.id]);
  if (!h) return null;
  const rows = h.months.map((m) => {
    const ent = h.entries.filter((e) => e.month === m.id);
    const ss = h.sessions.filter((x) => x.month === m.id);
    const came = ss.filter((x) => x.present.length).length;
    const line = m.doc ? computePayroll([av, ...ov.avrechim.filter((x) => x.id !== av.id)], m.doc, ent, ov.settings, ss).find((l) => l.avrech.id === av.id) : undefined;
    const simchas = (m.doc?.simchas ?? []).filter((x) => x.celebrantId === av.id);
    return { m, ent, ss, came, line, simchas };
  });
  return (
    <div className="adm-hist">
      <h3 className="adm-subhead">
        <Icon name="clock" width={18} height={18} style={{ verticalAlign: "-3px" }} /> היסטוריה
      </h3>
      {rows.map(({ m, ent, ss, came, line, simchas }) => (
        <div key={m.id} className="adm-hist__row">
          <button type="button" className="adm-hist__head" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
            <strong>
              {m.locked ? <Icon name="lock" width={13} height={13} /> : null} {m.label}
            </strong>
            {ss.length ? (
              <span className={`adm-attpill${came < ss.length ? " is-miss" : ""}`}>
                <Icon name="calendar" width={13} height={13} /> {came}/{ss.length}
              </span>
            ) : null}
            {simchas.length ? <Icon name="gift" width={16} height={16} style={{ color: "var(--flame)" }} /> : null}
            <span className="adm-hist__sum">{line ? money(line.total) : ent.length ? `${ent.length} דיווחים` : ""}</span>
          </button>
          {open === m.id ? (
            <div className="adm-hist__body">
              {line?.detail ? <p>{line.detail}</p> : null}
              {ent.map((e) => (
                <div key={e.id} className="adm-hist__ent">
                  <span>
                    {ENTRY_LABELS[e.type]}
                    {e.description ? ` · ${e.description}` : ""}
                  </span>
                  <strong style={{ color: e.amount < 0 ? "#b3261e" : undefined }}>{money(e.amount)}</strong>
                </div>
              ))}
              {!ent.length && !line?.detail ? <p className="muted">אין דיווחים בחודש הזה.</p> : null}
            </div>
          ) : null}
        </div>
      ))}
      {!rows.length ? <p className="muted">עדיין אין חודשים.</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ נוכחות בלי חיבור */

const QKEY = "tb-att-queue";
type QItem = { branchId: string; date: string; month: string; present: string[] };
function queueAttendance(x: QItem) {
  try {
    const list = (JSON.parse(localStorage.getItem(QKEY) || "[]") as QItem[]).filter((q) => !(q.branchId === x.branchId && q.date === x.date));
    localStorage.setItem(QKEY, JSON.stringify([...list, x]));
  } catch {
    /* אין אחסון במכשיר */
  }
}
async function flushAttendance(): Promise<number> {
  let list: QItem[] = [];
  try {
    list = JSON.parse(localStorage.getItem(QKEY) || "[]");
  } catch {
    return 0;
  }
  if (!list.length || !navigator.onLine) return 0;
  const left: QItem[] = [];
  let sent = 0;
  for (const x of list) {
    try {
      await put("/api/kollel/attendance", x);
      sent++;
    } catch (e) {
      if (e instanceof TypeError) left.push(x); // עדיין אין חיבור
    }
  }
  try {
    localStorage.setItem(QKEY, JSON.stringify(left));
  } catch {
    /* לא קריטי */
  }
  return sent;
}

/* ------------------------------------------------------------------ תזכורת נוכחות אוטומטית */

type Reminder = { enabled: boolean; time: string; days: number[]; channel: "sms" | "tzintuk"; text: string; lastSent?: string };
const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function ReminderSettings() {
  const [r, setR] = useState<Reminder | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ reminder: Reminder }>("/api/kollel/reminder").then((x) => setR(x.reminder)).catch(() => setR(null));
  }, []);
  if (!r) return null;
  const save = async (next: Reminder) => {
    setR(next);
    try {
      await put("/api/kollel/reminder", next);
      setMsg("נשמר");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "שגיאה");
    }
  };
  return (
    <section className="adm-panel">
      <div className="adm-panel__head">
        <h2>
          <Icon name="bell" width={20} height={20} style={{ verticalAlign: "-4px" }} /> תזכורת אוטומטית
        </h2>
        <button type="button" className={`adm-pushrow${r.enabled ? " is-on" : ""}`} style={{ width: "auto", margin: 0, padding: "6px 10px" }} onClick={() => save({ ...r, enabled: !r.enabled })} aria-pressed={r.enabled}>
          <span className="adm-switch" aria-hidden="true" />
        </button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        מנהל סניף שלא סימן נוכחות עד השעה שנקבעה - מקבל תזכורת.
      </p>
      <div className="adm-fields adm-fields--2">
        <label className="field">
          <span className="field__label">שעה</span>
          <input className="input" type="time" value={r.time} onChange={(e) => setR({ ...r, time: e.target.value })} onBlur={() => save(r)} />
        </label>
        <div className="field">
          <span className="field__label">ערוץ</span>
          <Chips<"sms" | "tzintuk"> value={r.channel} onChange={(channel) => save({ ...r, channel })} items={[{ id: "sms", label: "SMS" }, { id: "tzintuk", label: "צינתוק" }]} />
        </div>
        <div className="field span-2">
          <span className="field__label">ימים</span>
          <div className="adm-chips">
            {DAYS.map((d, i) => (
              <button key={d} type="button" className="adm-chip" aria-pressed={r.days.includes(i)} onClick={() => save({ ...r, days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i].sort() })}>
                {d}
              </button>
            ))}
          </div>
        </div>
        {r.channel === "sms" ? (
          <label className="field span-2">
            <span className="field__label">נוסח</span>
            <input className="input" value={r.text} onChange={(e) => setR({ ...r, text: e.target.value })} onBlur={() => save(r)} />
          </label>
        ) : null}
      </div>
      {msg ? <p className="muted" style={{ marginBottom: 0 }}>{msg}{r.lastSent ? ` · נשלחה לאחרונה ${r.lastSent}` : ""}</p> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ סטטוס חודש בשלבים */

type MStatus = { branches: { id: string; name: string; cityId: string; done: { byName: string; at: string } | null }[]; cities: { id: string; name: string; approved: { byName: string; at: string } | null }[] };

function MonthStatus({ ov, month, locked }: { ov: Overview; month: string; locked: boolean }) {
  const [st, setSt] = useState<MStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!month) return;
    api<MStatus>(`/api/kollel/status?month=${encodeURIComponent(month)}`).then(setSt).catch(() => setSt(null));
  }, [month]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["kollelMonthStatus"], load);
  if (!st || !st.branches.length) return null;
  const act = async (action: string, id: string) => {
    setErr(null);
    try {
      setSt(await post<MStatus>("/api/kollel/status", { month, action, id }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const isManager = ov.me.manager;
  const isCity = ov.me.canEditAvrechim && !isManager;
  const doneCount = st.branches.filter((b) => b.done).length;
  return (
    <section className="adm-panel adm-mstatus">
      <div className="adm-panel__head">
        <h2>
          <Icon name="checkCircle" width={20} height={20} style={{ verticalAlign: "-4px" }} /> סגירת החודש
        </h2>
        <span className="adm-chip__n" style={{ fontSize: "0.85rem" }}>
          {doneCount}/{st.branches.length} סניפים
        </span>
      </div>
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
      {st.cities.map((c) => {
        const bs = st.branches.filter((b) => b.cityId === c.id);
        const allDone = bs.every((b) => b.done);
        return (
          <div key={c.id} className="adm-mstatus__city">
            <div className="adm-mstatus__head">
              <strong>{c.name}</strong>
              {c.approved ? (
                <span className="adm-attpill" title={`${c.approved.byName}`}>
                  <Icon name="check" width={13} height={13} /> העיר אושרה
                </span>
              ) : null}
              {!locked && (isManager || isCity) ? (
                c.approved ? (
                  <button type="button" className="adm-chip" onClick={() => act("cityUndo", c.id)}>
                    ביטול אישור
                  </button>
                ) : (
                  <button type="button" className="adm-chip" aria-pressed={allDone} onClick={() => act("cityApprove", c.id)}>
                    <Icon name="check" width={14} height={14} /> אישור העיר
                  </button>
                )
              ) : null}
            </div>
            <div className="adm-chips" style={{ flexWrap: "wrap" }}>
              {bs.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`adm-chip adm-mstatus__b${b.done ? " is-done" : ""}`}
                  disabled={locked}
                  title={b.done ? `${b.done.byName}` : "לחיצה: סיימתי לדווח"}
                  onClick={() => act(b.done ? "branchUndo" : "branchDone", b.id)}
                >
                  <Icon name={b.done ? "checkCircle" : "clock"} width={15} height={15} /> {b.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!locked && !isManager && !isCity ? <p className="muted" style={{ marginBottom: 0 }}>כשסיימת לדווח לחודש - לוחצים על שם הסניף.</p> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ פרטי בנק ומסמכים (הנהלה) */

type Bank = { idNumber: string; bankCode: string; branchCode: string; account: string; holder: string };

function BankFields({ value, onChange }: { value: Bank | null; onChange: (b: Bank) => void }) {
  const v = value ?? { idNumber: "", bankCode: "", branchCode: "", account: "", holder: "" };
  const set = (k: keyof Bank, x: string) => onChange({ ...v, [k]: x });
  return (
    <fieldset className="span-2 adm-bank">
      <legend>
        <Icon name="lock" width={14} height={14} /> פרטי תשלום (הנהלה בלבד)
      </legend>
      <div className="adm-fields adm-fields--2">
        <label className="field">
          <span className="field__label">ת״ז</span>
          <input className="input" inputMode="numeric" dir="ltr" value={v.idNumber} onChange={(e) => set("idNumber", e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">שם בעל החשבון</span>
          <input className="input" value={v.holder} onChange={(e) => set("holder", e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">בנק</span>
          <input className="input" inputMode="numeric" dir="ltr" placeholder="12" value={v.bankCode} onChange={(e) => set("bankCode", e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">סניף</span>
          <input className="input" inputMode="numeric" dir="ltr" placeholder="123" value={v.branchCode} onChange={(e) => set("branchCode", e.target.value)} />
        </label>
        <label className="field span-2">
          <span className="field__label">מספר חשבון</span>
          <input className="input" inputMode="numeric" dir="ltr" value={v.account} onChange={(e) => set("account", e.target.value)} />
        </label>
      </div>
    </fieldset>
  );
}

type AFile = { id: string; name: string; label: string; type: string; size: number; createdAt: string };

function AvrechFiles({ av }: { av: Avrech }) {
  const [files, setFiles] = useState<AFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<{ files: AFile[] }>(`/api/kollel/avrechim/${av.id}/files`).then((r) => setFiles(r.files)).catch(() => setFiles([])), [av.id]);
  useEffect(() => {
    load();
  }, [load]);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 3.5 * 1024 * 1024) return setErr("הקובץ גדול מ-3.5MB");
    setBusy(true);
    setErr(null);
    const data = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.readAsDataURL(f);
    });
    const label = window.prompt("מה המסמך? (למשל: צילום ת״ז, אישור ניהול חשבון)", "") || "";
    try {
      await post(`/api/kollel/avrechim/${av.id}/files`, { name: f.name, type: f.type, data, label });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
    setBusy(false);
  };
  return (
    <div className="adm-hist">
      <h3 className="adm-subhead">
        <Icon name="file" width={18} height={18} style={{ verticalAlign: "-3px" }} /> מסמכים
      </h3>
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
      {(files ?? []).map((f) => (
        <div key={f.id} className="adm-hist__ent">
          <a href={`/api/kollel/files/${f.id}`} target="_blank" rel="noopener">
            <Icon name="file" width={15} height={15} /> {f.label || f.name}
          </a>
          <button
            type="button"
            className="adm-icon-btn adm-icon-btn--danger"
            aria-label="מחיקת מסמך"
            onClick={async () => {
              if (!window.confirm("למחוק את המסמך?")) return;
              await del(`/api/kollel/files/${f.id}`);
              load();
            }}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <label className="btn btn--ghost btn--sm" style={{ marginTop: 8, cursor: "pointer" }}>
        <Icon name="plus" /> {busy ? "מעלה…" : "העלאת מסמך"}
        <input type="file" accept="image/*,application/pdf" hidden disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
    </div>
  );
}
