/**
 * טבלה בסגנון אקסל (כמו בנוסעים בן טובים): כותרת נעולה, מיון בלחיצה על עמודה,
 * גובה שורה לבחירה (צפוף / רגיל / מרווח), הסתרת עמודות, צבע שורה לפי מצב וייצוא.
 * ההעדפות נשמרות במכשיר לכל טבלה בנפרד.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";

type TouchLike = { touches: ArrayLike<{ clientX: number; clientY: number }>; preventDefault(): void };
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
type Prefs = { density: Density; hidden: string[]; zoom?: number };

const read = (id: string, cols: Col<unknown>[]): Prefs => {
  try {
    const p = JSON.parse(localStorage.getItem(`tb-sheet:${id}`) || "null") as Prefs | null;
    if (p) return p;
  } catch {
    /* */
  }
  return { density: "normal", hidden: cols.filter((c) => c.hidden).map((c) => c.key) };
};

const HE = new Intl.Collator("he", { numeric: true });

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
  group,
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
  /** קיבוץ שורות (למשל כל הסניפים של אותה עיר) - כותרת קבוצה ופס צבע לסירוגין */
  group?: { key: (r: T) => string; label: (r: T, count: number) => ReactNode };
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
  // הגדלה/הקטנה של הטבלה בלבד (בכפתורים או בצביטה בשתי אצבעות) - שאר המסך לא זז
  const zoom = prefs.zoom ?? 1;
  const setZoom = (z: number) => save({ ...prefs, zoom: Math.round(Math.min(1.8, Math.max(0.6, z)) * 100) / 100 });
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const pinchZoom = useRef<number | null>(null);
  const dist = (e: TouchLike) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  const visible = cols.filter((c) => c.fixed || !prefs.hidden.includes(c.key));
  // העמודות מגיעות לרוב כמערך חדש בכל ציור - המיון תלוי רק במפתחות שלהן, כדי לא למיין שוב בכל הקלדה
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const colsSig = cols.map((c) => c.key).join("|");
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = colsRef.current.find((x) => x.key === sort.key);
    if (!c?.value) return rows;
    const v = c.value;
    // מחשבים את ערך המיון פעם אחת לכל שורה, ומשווים בעברית עם Collator (מהיר פי כמה מ-localeCompare)
    const withVal = rows.map((r) => ({ r, x: v(r) }));
    withVal.sort((a, b) => (typeof a.x === "number" && typeof b.x === "number" ? a.x - b.x : HE.compare(String(a.x ?? ""), String(b.x ?? ""))) * sort.dir);
    return withVal.map((w) => w.r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, colsSig]);

  const groupRef = useRef(group);
  groupRef.current = group;
  const { groupIndex, groupCount } = useMemo(() => {
    const idx = new Map<string, number>();
    const cnt = new Map<string, number>();
    const g0 = groupRef.current;
    if (g0) for (const r of sorted) { const g = g0.key(r); if (!idx.has(g)) idx.set(g, idx.size); cnt.set(g, (cnt.get(g) || 0) + 1); }
    return { groupIndex: idx, groupCount: cnt };
  }, [sorted, Boolean(group)]);

  // בטבלאות ארוכות מציגים 300 שורות בכל פעם (הייצוא לאקסל תמיד כולל הכל)
  const [limit, setLimit] = useState(300);
  const shown = sorted.length > limit ? sorted.slice(0, limit) : sorted;
  const tableRef = useRef<HTMLTableElement>(null);

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
        <div className="adm-sheet__zoom" aria-label="גודל הטבלה">
          <button type="button" onClick={() => setZoom(zoom - 0.1)} aria-label="הקטנת הטבלה" title="הקטנה">−</button>
          <button type="button" className="adm-sheet__zoomval" onClick={() => setZoom(1)} title="חזרה לגודל רגיל">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom(zoom + 0.1)} aria-label="הגדלת הטבלה" title="הגדלה">+</button>
        </div>
        {exportName ? (
          <button type="button" className="adm-ut-act" title="ייצוא לאקסל" aria-label="ייצוא לאקסל" onClick={exportXlsx}>
            <Icon name="download" />
          </button>
        ) : null}
      </div>
      <div
        className="adm-sheet__wrap"
        onTouchStart={(e) => {
          if (e.touches.length === 2) pinch.current = { d: dist(e), z: zoom };
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinch.current) {
            e.preventDefault();
            // בזמן הצביטה משנים רק את התצוגה, בלי לצייר מחדש את כל השורות; שומרים בסיום
            const next = Math.min(1.8, Math.max(0.6, pinch.current.z * (dist(e) / pinch.current.d)));
            pinchZoom.current = next;
            if (tableRef.current) tableRef.current.style.zoom = String(next);
          }
        }}
        onTouchEnd={() => {
          if (pinch.current) {
            pinch.current = null;
            if (pinchZoom.current !== null) setZoom(pinchZoom.current);
            pinchZoom.current = null;
          }
        }}
      >
        <table ref={tableRef} className="adm-sheet__t" style={{ zoom }}>
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
            {shown.map((r, i) => {
              const k = rowKey(r);
              const gk = group && !sort ? group.key(r) : null;
              const startsGroup = gk !== null && (i === 0 || group!.key(sorted[i - 1]) !== gk);
              const gIndex = gk !== null ? groupIndex.get(gk) ?? 0 : 0;
              const t = tone?.(r) || "none";
              const tr = (
                <tr key={k} className={`adm-sheet__tone--${t}${current === k ? " is-current" : ""}${onRow ? " is-click" : ""}${gk !== null ? ` adm-sheet__band--${gIndex % 2}` : ""}`} onClick={onRow ? (ev) => { if (!(ev.target as HTMLElement).closest("a,button,input,select")) onRow(r); } : undefined}>
                  {visible.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align === "center" ? "center" : undefined }}>{c.cell(r)}</td>
                  ))}
                </tr>
              );
              if (!startsGroup) return tr;
              const count = groupCount.get(gk) ?? 0;
              return [
                <tr key={`g:${gk}`} className={`adm-sheet__group adm-sheet__band--${gIndex % 2}`}>
                  <td colSpan={visible.length}>{group!.label(r, count)}</td>
                </tr>,
                tr,
              ];
            })}
            {sorted.length > shown.length ? (
              <tr>
                <td colSpan={visible.length} className="adm-ut-empty">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLimit((n) => n + 300)}>
                    הצגת עוד {Math.min(300, sorted.length - shown.length)} (מתוך {sorted.length})
                  </button>
                </td>
              </tr>
            ) : null}
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
