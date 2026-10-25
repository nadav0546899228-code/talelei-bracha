/** חיפוש כללי: אברכים, משתתפות, פניות, רכזים, אנשי קשר ותורמים - לפי ההרשאות */
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { api, type View } from "./api";

type Result = { kind: string; id: string; title: string; sub?: string; view: View; tab?: string };
const KIND: Record<string, { label: string; icon: IconName }> = {
  avrech: { label: "אברך", icon: "book" },
  mitch: { label: "מתחזק/ת", icon: "heart" },
  member: { label: "משתתפת", icon: "heart" },
  submission: { label: "פנייה", icon: "inbox" },
  staff: { label: "צוות", icon: "users" },
  contact: { label: "איש קשר", icon: "phone" },
  donation: { label: "תרומה", icon: "gift" },
};

export function SearchModal({ onClose, onGo }: { onClose: () => void; onGo: (v: View, tab?: string) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result[] | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setRes(null);
      return;
    }
    const my = ++seq.current;
    const h = window.setTimeout(() => {
      api<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(t)}`)
        .then((r) => my === seq.current && setRes(r.results))
        .catch(() => my === seq.current && setRes([]));
    }, 250);
    return () => window.clearTimeout(h);
  }, [q]);
  return (
    <div className="adm-modal-back adm-search-back" role="dialog" aria-modal="true" aria-label="חיפוש" onClick={onClose}>
      <div className="adm-modal adm-searchbox" onClick={(e) => e.stopPropagation()}>
        <div className="adm-searchbox__bar">
          <Icon name="search" />
          <input className="input" autoFocus type="search" placeholder="חיפוש שם, טלפון או מייל" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש" />
          <button type="button" className="adm-icon-btn" aria-label="סגירה" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="adm-searchbox__list">
          {(res ?? []).map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              type="button"
              className="adm-pop__item"
              onClick={() => {
                onClose();
                onGo(r.view, r.tab);
              }}
            >
              <Icon name={KIND[r.kind]?.icon ?? "file"} />
              <span>
                {r.title}
                {r.sub ? <small className="muted" style={{ display: "block", fontWeight: 500 }}>{r.sub}</small> : null}
              </span>
              <small className="muted">{KIND[r.kind]?.label}</small>
            </button>
          ))}
          {res && !res.length ? <p className="muted" style={{ textAlign: "center" }}>לא נמצא</p> : null}
        </div>
      </div>
    </div>
  );
}
