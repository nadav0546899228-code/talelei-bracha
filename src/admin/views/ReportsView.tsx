/** דוחות למנכ״ל ולרכז הראשי - השוואה בין ערים וסניפים בגרפים */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api } from "../api";
import { Chips, money } from "../components";
import { computePayroll, type AttendanceSession, type Entry, type MonthDoc } from "../kollelCalc";
import type { Overview } from "./KollelView";

type Data = { ov: Overview; entries: Entry[]; sessions: (AttendanceSession & { month: string })[]; docs: Record<string, MonthDoc | null> };

function Bars({ rows, fmt = (n: number) => n.toLocaleString("he-IL"), max: forced }: { rows: { label: string; value: number; sub?: string }[]; fmt?: (n: number) => string; max?: number }) {
  const max = forced ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted">אין נתונים</p>;
  return (
    <div className="adm-bars">
      {rows.map((r) => (
        <div key={r.label} className="adm-bars__row">
          <span className="adm-bars__label" title={r.label}>
            {r.label}
          </span>
          <span className="adm-bars__track">
            <span className="adm-bars__fill" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
          <span className="adm-bars__val">
            {fmt(r.value)}
            {r.sub ? <small>{r.sub}</small> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReportsView() {
  const [d, setD] = useState<Data | null>(null);
  const [month, setMonth] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ov = await api<Overview>("/api/kollel/overview");
      const [e, a] = await Promise.all([
        api<{ entries: Entry[] }>("/api/kollel/entries?all=1"),
        api<{ sessions: (AttendanceSession & { month: string })[] }>("/api/kollel/attendance"),
      ]);
      const docs: Record<string, MonthDoc | null> = {};
      await Promise.all(ov.months.map(async (m) => (docs[m.id] = (await api<{ month: MonthDoc | null }>(`/api/kollel/months/${encodeURIComponent(m.id)}`)).month)));
      setD({ ov, entries: e.entries, sessions: a.sessions, docs });
      setMonth(ov.months[0]?.id ?? "");
    })().catch((e) => setErr(e.message));
  }, []);

  const calc = useMemo(() => {
    if (!d) return null;
    const { ov } = d;
    const perMonth = [...ov.months]
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const lines = computePayroll(ov.avrechim, d.docs[m.id], d.entries.filter((e) => e.month === m.id), ov.settings, d.sessions.filter((s) => s.month === m.id));
        return { id: m.id, label: m.label, lines, total: lines.reduce((t, l) => t + l.total, 0) };
      });
    const cur = perMonth.find((m) => m.id === month);
    const branchOf = (id: string | null | undefined) => ov.branches.find((b) => b.id === id);
    const cityOfBranch = (id: string | null | undefined) => ov.cities.find((c) => c.id === branchOf(id)?.parentId);
    const active = ov.avrechim.filter((a) => a.active);
    const byCity = ov.cities.map((c) => ({ label: c.name, value: active.filter((a) => cityOfBranch(a.branchId)?.id === c.id).length }));
    const costByCity = ov.cities.map((c) => ({ label: c.name, value: (cur?.lines ?? []).filter((l) => cityOfBranch(l.avrech.branchId)?.id === c.id).reduce((t, l) => t + l.total, 0) }));
    const attByBranch = ov.branches
      .map((b) => {
        const ss = d.sessions.filter((s) => s.month === month && s.branchId === b.id);
        const n = active.filter((a) => a.branchId === b.id).length;
        const possible = ss.length * n;
        const came = ss.reduce((t, s) => t + s.present.length, 0);
        return { label: `${b.name} (${ov.cities.find((c) => c.id === b.parentId)?.name ?? ""})`, value: possible ? Math.round((came / possible) * 100) : 0, sub: ss.length ? `${ss.length} מפגשים` : "לא סומן", has: ss.length > 0 };
      })
      .sort((a, b) => Number(b.has) - Number(a.has) || b.value - a.value);
    const allSessions = d.sessions.filter((s) => s.month === month);
    const totalPossible = allSessions.reduce((t, s) => t + active.filter((a) => a.branchId === s.branchId).length, 0);
    const avgAtt = totalPossible ? Math.round((allSessions.reduce((t, s) => t + s.present.length, 0) / totalPossible) * 100) : null;
    return { perMonth, cur, byCity, costByCity, attByBranch, avgAtt, active };
  }, [d, month]);

  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!d || !calc) return <p className="muted">טוען…</p>;

  return (
    <>
      <div className="adm-head">
        <h1>דוחות</h1>
      </div>
      {d.ov.months.length ? <Chips<string> value={month} onChange={setMonth} items={d.ov.months.map((m) => ({ id: m.id, label: m.label }))} /> : null}

      <div className="adm-tiles">
        <div className="adm-tile adm-tile--teal">
          <span className="adm-tile__icon">
            <Icon name="users" />
          </span>
          <span className="adm-tile__n">{calc.active.length}</span>
          <span className="adm-tile__l">אברכים פעילים</span>
        </div>
        <div className="adm-tile">
          <span className="adm-tile__icon">
            <Icon name="pin" />
          </span>
          <span className="adm-tile__n">{d.ov.branches.length}</span>
          <span className="adm-tile__l">סניפים ב-{d.ov.cities.length} ערים</span>
        </div>
        <div className="adm-tile">
          <span className="adm-tile__icon">
            <Icon name="file" />
          </span>
          <span className="adm-tile__n" style={{ fontSize: "1.3rem" }}>
            {calc.cur ? money(calc.cur.total) : "-"}
          </span>
          <span className="adm-tile__l">עלות החודש</span>
        </div>
        <div className="adm-tile">
          <span className="adm-tile__icon">
            <Icon name="calendar" />
          </span>
          <span className="adm-tile__n">{calc.avgAtt === null ? "-" : `${calc.avgAtt}%`}</span>
          <span className="adm-tile__l">נוכחות ממוצעת</span>
        </div>
      </div>

      <section className="adm-panel" style={{ marginTop: 14 }}>
        <h2>עלות לפי חודשים</h2>
        <Bars rows={calc.perMonth.map((m) => ({ label: m.label, value: m.total }))} fmt={money} />
      </section>
      <section className="adm-panel">
        <h2>עלות החודש לפי עיר</h2>
        <Bars rows={calc.costByCity} fmt={money} />
      </section>
      <section className="adm-panel">
        <h2>אברכים לפי עיר</h2>
        <Bars rows={calc.byCity} />
      </section>
      <section className="adm-panel">
        <h2>נוכחות לפי סניף</h2>
        <Bars rows={calc.attByBranch} fmt={(n) => `${n}%`} max={100} />
      </section>
    </>
  );
}
