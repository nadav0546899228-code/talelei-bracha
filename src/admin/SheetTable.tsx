/**
 * טבלה בסגנון אקסל (כמו בנוסעים בן טובים): כותרת נעולה, מיון בלחיצה על עמודה,
 * גובה שורה לבחירה (צפוף / רגיל / מרווח), הסתרת עמודות, צבע שורה לפי מצב וייצוא.
 * ההעדפות נשמרות במכשיר לכל טבלה בנפרד.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { buildXlsx, downloadBlob } from "./xlsx";

export type Col<T> = {
  key: string;
  label: string;
  /** מה מוצג בתא */
  cell: (r: T) => ReactNode;
  /** ערך למיון ולייצוא */
  value?: (r: T) => string | number;
  width?: number;
  /** עמודה שלא ניתן להסתיר (למשל שם) */
  fixed?: boolean;
  hidden?: boolean;
  align?: "start" | "center";
};
type Density = "compact" | "normal" | "roomy";
type Prefs = { density: Density; hidden: string[] };

const read = (id: string, cols: Col<unknown>[]): Prefs => {
  try {
    const p = JSON.parse(localStorage.getItem(`tb-sheet:${id}`) || "null") as Prefs | null;
    if (p) return p;
  } catch {
    /* */
  }
  return { density: "normal", hidden: cols.filter((c) => c.hidden).map((c) => c.key) };
};

export function SheetTable<T>({
  id,
  rows,
  cols,
  rowKey,
  onRow,
  tone,
  exportName,
  current,
  empty = "אין נתונים להצגה",
  toolbar,
}: {
  id: string;
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  tone?: (r: T) => "red" | "yellow" | "green" | "grey" | "none";
  exportName?: string;
  current?: string | null;
  empty?: string;
  toolbar?: ReactNode;
}) {
  const [prefs, setPrefs] = useState<Prefs>(() => read(id, cols as Col<unknown>[]));
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const save = (p: Prefs) => {
    setPrefs(p);
    try {
      localStorage.setItem(`tb-sheet:${id}`, JSON.stringify(p));
    } catch {
      /* */
    }
  };
  const visible = cols.filter((c) => c.fixed || !prefs.hidden.includes(c.key));
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c?.value) return rows;
    const v = c.value;
    return [...rows].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "he")) * sort.dir;
    });
  }, [rows, sort, cols]);

  const exportXlsx = () => {
    const ex = visible.filter((c) => c.value);
    downloadBlob(
      buildXlsx([{ name: exportName || "גיליון", rows: [ex.map((c) => c.label), ...sorted.map((r) => ex.map((c) => c.value!(r)))], widths: ex.map((c) => Math.max(10, Math.round((c.width || 120) / 7))) }]),
      `${exportName || "גיליון"}.xlsx`,
    );
  };

  return (
    <div className={`adm-sheet adm-sheet--${prefs.density}`}>
      <div className="adm-sheet__tools">
        {toolbar}
        <span className="adm-sheet__count">{rows.length} שורות</span>
        <div className="adm-sheet__density" role="radiogroup" aria-label="גובה שורה">
          {([["compact", "צפוף"], ["normal", "רגיל"], ["roomy", "מרווח"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={prefs.density === v} className={prefs.density === v ? "is-on" : ""} title={`גובה שורה: ${l}`} onClick={() => save({ ...prefs, density: v })}>
              <span className={`adm-sheet__lines adm-sheet__lines--${v}`} aria-hidden="true"><i /><i /><i /></span>
            </button>
          ))}
        </div>
        <div className="adm-sheet__colsbox">
          <button type="button" className="adm-ut-act" title="עמודות" aria-label="בחירת עמודות" onClick={() => setColsOpen(!colsOpen)}>
            <Icon name="list" />
          </button>
          {colsOpen ? (
            <div className="adm-sheet__cols" role="menu">
              {cols.filter((c) => !c.fixed).map((c) => (
                <label key={c.key}>
                  <input
                    type="checkbox"
                    checked={!prefs.hidden.includes(c.key)}
                    onChange={(e) => save({ ...prefs, hidden: e.target.checked ? prefs.hidden.filter((k) => k !== c.key) : [...prefs.hidden, c.key] })}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        {exportName ? (
          <button type="button" className="adm-ut-act" title="ייצוא לאקסל" aria-label="ייצוא לאקסל" onClick={exportXlsx}>
            <Icon name="download" />
          </button>
        ) : null}
      </div>
      <div className="adm-sheet__wrap">
        <table className="adm-sheet__t">
          <thead>
            <tr>
              {visible.map((c) => (
                <th
                  key={c.key}
                  style={{ minWidth: c.width, textAlign: c.align === "center" ? "center" : undefined }}
                  className={c.value ? "is-sortable" : ""}
                  onClick={c.value ? () => setSort(sort?.key === c.key ? (sort.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }) : undefined}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                >
                  {c.label}
                  {sort?.key === c.key ? <span className="adm-sheet__arrow">{sort.dir === 1 ? "▲" : "▼"}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const k = rowKey(r);
              const t = tone?.(r) || "none";
              return (
                <tr key={k} className={`adm-sheet__tone--${t}${current === k ? " is-current" : ""}${onRow ? " is-click" : ""}`} onClick={onRow ? (ev) => { if (!(ev.target as HTMLElement).closest("a,button,input,select")) onRow(r); } : undefined}>
                  {visible.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align === "center" ? "center" : undefined }}>{c.cell(r)}</td>
                  ))}
                </tr>
              );
            })}
            {!sorted.length ? (
              <tr>
                <td colSpan={visible.length} className="adm-ut-empty">{empty}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
