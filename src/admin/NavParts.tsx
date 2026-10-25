/** מסך כפתור-על, ועורך השורה התחתונה */
import { useState } from "react";
import { Icon } from "../components/Icon";
import type { NavEntry, NavHub, NavLeaf } from "./nav";

export function HubView({ hub, badge, onOpen }: { hub: NavHub; badge: (l: NavLeaf) => number; onOpen: (l: NavLeaf) => void }) {
  // קבוצות (אנשים / יצירת קשר) סגורות - נפתחות בלחיצה
  const [openG, setOpenG] = useState<string | null>(null);
  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{hub.label}</h1>
        </div>
      </div>
      {(hub.items.some((l) => l.group) ? [...new Set(hub.items.map((l) => l.group || ""))] : [""]).map((g) => (
      <section key={g || "all"} className="adm-hub-group">
      {g ? (
        <button type="button" className={`adm-hub-group__btn${openG === g ? " is-open" : ""}`} aria-expanded={openG === g} onClick={() => setOpenG(openG === g ? null : g)}>
          <span className="adm-hub__icon"><Icon name={g === "אנשים" ? "users" : "chat"} /></span>
          <strong>{g}</strong>
          <small>{hub.items.filter((l) => l.group === g).length}</small>
          {hub.items.filter((l) => l.group === g).reduce((n, l) => n + badge(l), 0) ? <span className="adm-badge">{hub.items.filter((l) => l.group === g).reduce((n, l) => n + badge(l), 0)}</span> : null}
          <Icon name="chevronDown" className="adm-hub-group__chev" />
        </button>
      ) : null}
      {!g || openG === g ? (
      <div className="adm-hub">
        {hub.items.filter((l) => !g || l.group === g).map((l) => {
          const b = badge(l);
          return (
            <button key={l.id} type="button" className="adm-hub__tile" onClick={() => onOpen(l)}>
              <span className="adm-hub__icon">
                <Icon name={l.icon} />
              </span>
              <span className="adm-hub__text">
                <strong>{l.label}</strong>
                {l.hint ? <small>{l.hint}</small> : null}
              </span>
              {b ? <span className="adm-badge">{b}</span> : null}
              <Icon name="arrowLeft" className="adm-hub__go" />
            </button>
          );
        })}
      </div>
      ) : null}
      </section>
      ))}
    </>
  );
}

export function BarEditor({
  entries,
  value,
  onSave,
  onClose,
  onReset,
}: {
  entries: NavEntry[];
  value: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  const [ids, setIds] = useState<string[]>(value);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    setIds(next);
  };
  const chosen = ids.map((id) => entries.find((e) => e.id === id)).filter(Boolean) as NavEntry[];
  const rest = entries.filter((e) => !ids.includes(e.id));
  const mains = rest.filter((e) => !e.id.startsWith("leaf:"));
  const shortcuts = rest.filter((e) => e.id.startsWith("leaf:"));

  const addBtn = (e: NavEntry) => (
    <button key={e.id} type="button" className="adm-baredit__add" onClick={() => setIds([...ids, e.id])}>
      <Icon name="plus" /> <Icon name={e.icon} /> {e.label}
    </button>
  );

  return (
    <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="עריכת השורה התחתונה">
      <div className="adm-modal">
        <h2>עריכת השורה התחתונה</h2>
        <p className="muted" style={{ marginTop: -4 }}>
          מה מופיע בשורה ובאיזה סדר. החצים מזיזים, ה-X מוריד.
        </p>
        <div className="adm-baredit">
          {chosen.map((e, i) => (
            <div key={e.id} className="adm-baredit__row">
              <Icon name={e.icon} />
              <span>{e.label}</span>
              <button type="button" className="adm-icon-btn" aria-label={`להזיז את ${e.label} ימינה`} disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="arrowUp" />
              </button>
              <button type="button" className="adm-icon-btn" aria-label={`להזיז את ${e.label} שמאלה`} disabled={i === chosen.length - 1} onClick={() => move(i, 1)}>
                <Icon name="arrowDown" />
              </button>
              <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label={`להוריד את ${e.label}`} disabled={chosen.length === 1} onClick={() => setIds(ids.filter((x) => x !== e.id))}>
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
        {mains.length ? (
          <>
            <h3 className="adm-subhead">כפתורים ראשיים</h3>
            <div className="adm-baredit__adds">{mains.map(addBtn)}</div>
          </>
        ) : null}
        {shortcuts.length ? (
          <>
            <h3 className="adm-subhead">קיצורים ישירים</h3>
            <div className="adm-baredit__adds">{shortcuts.map(addBtn)}</div>
          </>
        ) : null}
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn--sm" onClick={() => onSave(ids)}>
            שמירה
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            ביטול
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
            ברירת מחדל
          </button>
        </div>
      </div>
    </div>
  );
}
