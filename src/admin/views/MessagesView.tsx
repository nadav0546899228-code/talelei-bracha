/** הודעות פנימיות: תיבה אחת, השבה, סימון כמה יחד, מחיקה וסימון כנקרא */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, fmtDateTime, post, type Me } from "../api";
import { Chips, Fab } from "../components";
import { useLive } from "../live";

type Msg = { id: string; from: string; fromName: string; to: string[]; toNames: string[]; text: string; replyTo: string | null; read: boolean; mine: boolean; createdAt: string };
type Rcpt = { id: string; name: string; role: string };

export function MessagesView({ me }: { me: Me }) {
  const [list, setList] = useState<Msg[] | null>(null);
  const [filter, setFilter] = useState<"in" | "unread" | "sent">("in");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Msg | null>(null);
  const [compose, setCompose] = useState<{ to: string[]; text: string; replyTo?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const readOnly = Boolean(me.user.impersonatedBy);

  const load = useCallback(() => api<{ messages: Msg[] }>("/api/messages").then((r) => setList(r.messages)).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["messages"], load);

  const rows = useMemo(() => (list ?? []).filter((m) => (filter === "sent" ? m.mine : !m.mine && (filter === "in" || !m.read))), [list, filter]);
  const unread = (list ?? []).filter((m) => !m.mine && !m.read).length;

  const act = async (kind: "read" | "delete", ids: string[]) => {
    if (!ids.length) return;
    if (kind === "delete" && !window.confirm(ids.length > 1 ? `למחוק ${ids.length} הודעות?` : "למחוק את ההודעה?")) return;
    await post(`/api/messages/${kind}`, { ids }).catch((e) => setErr(e.message));
    setPicked(new Set());
    if (kind === "delete") setOpen(null);
    load();
  };
  const openMsg = (m: Msg) => {
    setOpen(m);
    if (!m.read && !readOnly) act("read", [m.id]);
  };
  const togglePick = (id: string) => {
    const n = new Set(picked);
    n.has(id) ? n.delete(id) : n.add(id);
    setPicked(n);
  };

  return (
    <>
      <div className="adm-head">
        <h1>הודעות</h1>
      </div>
      <Chips<"in" | "unread" | "sent">
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setPicked(new Set());
        }}
        items={[
          { id: "in", label: "נכנסות" },
          { id: "unread", label: "לא נקראו", count: unread },
          { id: "sent", label: "יוצאות" },
        ]}
      />
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}

      {picked.size && !readOnly ? (
        <div className="adm-selbar">
          <strong>{picked.size} נבחרו</strong>
          <button type="button" className="adm-icon-btn" aria-label="סימון כנקרא" title="סימון כנקרא" onClick={() => act("read", [...picked])}>
            <Icon name="check" />
          </button>
          <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label="מחיקה" title="מחיקה" onClick={() => act("delete", [...picked])}>
            <Icon name="trash" />
          </button>
          <button type="button" className="adm-icon-btn" aria-label="ביטול בחירה" onClick={() => setPicked(new Set())}>
            <Icon name="close" />
          </button>
        </div>
      ) : null}

      <div className="adm-split">
        <div className="adm-list">
          {rows.map((m) => (
            <div key={m.id} className={`adm-msg${m.read ? "" : " is-unread"}${open?.id === m.id ? " is-open" : ""}`}>
              {!readOnly ? (
                <input type="checkbox" className="adm-msg__pick" checked={picked.has(m.id)} onChange={() => togglePick(m.id)} aria-label="בחירה" />
              ) : null}
              <button type="button" className="adm-msg__body" onClick={() => openMsg(m)}>
                <span className="adm-msg__who">{m.mine ? `אל: ${m.toNames.join(", ")}` : m.fromName}</span>
                <span className="adm-msg__time">{fmtDateTime(m.createdAt)}</span>
                <span className="adm-msg__text">{m.text}</span>
              </button>
            </div>
          ))}
          {list && !rows.length ? (
            <div className="adm-panel adm-empty">
              <Icon name="chat" /> אין הודעות
            </div>
          ) : null}
        </div>

        {open ? (
          <section className="adm-panel adm-detail is-open" aria-label="הודעה">
            <div className="adm-panel__head">
              <h2>{open.mine ? `אל: ${open.toNames.join(", ")}` : open.fromName}</h2>
              <span className="adm-item__actions">
                {!readOnly ? (
                  <>
                    {!open.mine ? (
                      <button type="button" className="adm-icon-btn adm-icon-btn--ok" aria-label="השבה" title="השבה" onClick={() => setCompose({ to: [open.from], text: "", replyTo: open.id })}>
                        <Icon name="arrowRight" />
                      </button>
                    ) : null}
                    <button type="button" className="adm-icon-btn adm-icon-btn--danger" aria-label="מחיקה" title="מחיקה" onClick={() => act("delete", [open.id])}>
                      <Icon name="trash" />
                    </button>
                  </>
                ) : null}
                <button type="button" className="adm-icon-btn adm-sheet-back" aria-label="סגירה" onClick={() => setOpen(null)}>
                  <Icon name="close" />
                </button>
              </span>
            </div>
            <p className="muted" style={{ marginTop: -6 }}>
              {fmtDateTime(open.createdAt)}
            </p>
            <p className="adm-msg__full">{open.text}</p>
          </section>
        ) : (
          <div className="adm-panel adm-empty adm-detail-empty">
            <Icon name="chat" />
          </div>
        )}
      </div>

      {!readOnly && !compose ? <Fab label="הודעה חדשה" onClick={() => setCompose({ to: [], text: "" })} /> : null}
      {compose ? <Compose value={compose} onClose={() => setCompose(null)} onSent={() => (setCompose(null), load())} /> : null}
    </>
  );
}

function Compose({ value, onClose, onSent }: { value: { to: string[]; text: string; replyTo?: string }; onClose: () => void; onSent: () => void }) {
  const [rcpts, setRcpts] = useState<Rcpt[]>([]);
  const [to, setTo] = useState<string[]>(value.to);
  const [text, setText] = useState(value.text);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ recipients: Rcpt[] }>("/api/messages/recipients").then((r) => setRcpts(r.recipients));
  }, []);
  const shown = rcpts.filter((r) => !q.trim() || `${r.name} ${r.role}`.includes(q.trim()));
  const send = async () => {
    try {
      await post("/api/messages", { to, text, replyTo: value.replyTo });
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  return (
    <div className="adm-modal-back" role="dialog" aria-modal="true" aria-label="הודעה חדשה" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-panel__head">
          <h2>{value.replyTo ? "השבה" : "הודעה חדשה"}</h2>
          <button type="button" className="adm-icon-btn" aria-label="סגירה" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {!value.replyTo ? (
          <>
            <input className="input" type="search" placeholder="למי?" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש נמען" />
            <div className="adm-chips" style={{ flexWrap: "wrap", marginTop: 8, maxHeight: 180, overflowY: "auto" }}>
              {shown.map((r) => (
                <button key={r.id} type="button" className="adm-chip" aria-pressed={to.includes(r.id)} title={r.role} onClick={() => setTo(to.includes(r.id) ? to.filter((x) => x !== r.id) : [...to, r.id])}>
                  {r.name}
                </button>
              ))}
              {!rcpts.length ? <p className="muted">טוען…</p> : null}
            </div>
          </>
        ) : null}
        <textarea className="textarea" style={{ minHeight: 120, marginTop: 8 }} placeholder="כתיבת הודעה…" value={text} autoFocus onChange={(e) => setText(e.target.value)} />
        {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn--sm" disabled={!text.trim() || !to.length} onClick={send}>
            <Icon name="arrowLeft" /> שליחה
          </button>
        </div>
      </div>
    </div>
  );
}
