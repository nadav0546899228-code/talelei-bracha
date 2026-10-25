/** בנות צילה - משתתפות ופעילויות לפי סניף */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, post, type Me, type OrgUnit } from "../api";
import { Chips, Combo, ContactActions, ExportBtn, Fab, IconActions, SwipeRow } from "../components";
import { useLive } from "../live";
import { ChallahPanel } from "./ChallahView";
import { MitchPanel } from "./MitchView";
import { SharesPanel } from "./SharesView";
import { buildXlsx, downloadBlob } from "../xlsx";

type Member = { id: string; name: string; phone: string; branchId: string; active: boolean; notes?: string };
type Activity = { id: string; branchId: string; date: string; title: string; present: string[]; byName: string };
type Data = { cities: OrgUnit[]; branches: OrgUnit[]; members: Member[]; activities: Activity[] };

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabel = (iso: string) => new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "numeric", month: "numeric" }).format(new Date(`${iso}T12:00:00`));

export function BnotView({ initialTab }: { me: Me; initialTab?: string }) {
  const [d, setD] = useState<Data | null>(null);
  type BTab = "challah" | "mitch" | "members" | "activities" | "shares";
  const [tab, setTab] = useState<BTab>(
    initialTab === "activities" ? "activities" : initialTab?.startsWith("members") ? "members" : initialTab?.startsWith("mitch") ? "mitch" : initialTab === "shares" ? "shares" : "challah",
  );
  const [branch, setBranch] = useState("all");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Data>("/api/bnot/overview").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["bnotMembers", "bnotActivities", "orgUnits"], load);

  if (err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if (!d) return <p className="muted">טוען…</p>;
  if (!d.branches.length) return <div className="adm-panel adm-empty">אין עדיין סניפים בבנות צילה. מוסיפים במסך "ערים, סניפים ורכזות".</div>;
  const bName = (id: string) => {
    const b = d.branches.find((x) => x.id === id);
    return b ? `${b.name} · ${d.cities.find((c) => c.id === b.parentId)?.name ?? ""}` : "";
  };

  return (
    <>
      <div className="adm-head">
        <h1>בנות צילה</h1>
      </div>
      <div className="adm-tabs-inline" role="tablist">
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "challah"} onClick={() => setTab("challah")}>
          <Icon name="sparkle" width={16} height={16} /> הפרשת חלה
        </button>
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "mitch"} onClick={() => setTab("mitch")}>
          <Icon name="heart" width={16} height={16} /> מתחזקות
        </button>
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "shares"} onClick={() => setTab("shares")}>
          <Icon name="share" width={16} height={16} /> שיתופים
        </button>
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "members"} onClick={() => setTab("members")}>
          <Icon name="users" width={16} height={16} /> משתתפות ({d.members.filter((m) => m.active).length})
        </button>
        <button type="button" role="tab" className="adm-chip" aria-pressed={tab === "activities"} onClick={() => setTab("activities")}>
          <Icon name="calendar" width={16} height={16} /> פעילויות
        </button>
      </div>
      {tab === "challah" ? <ChallahPanel /> : null}
      {tab === "shares" ? <SharesPanel domain="bnot" /> : null}
      {tab === "mitch" ? <MitchPanel domain="bnot" initialQ={initialTab?.startsWith("mitch:q:") ? initialTab.slice(8) : ""} /> : null}
      {(tab === "members" || tab === "activities") && d.branches.length > 1 ? (
        <Chips<string> value={tab === "activities" && branch === "all" ? d.branches[0].id : branch} onChange={setBranch} items={[...(tab === "members" ? [{ id: "all", label: "כל הסניפים" }] : []), ...d.branches.map((b) => ({ id: b.id, label: b.name }))]} />
      ) : null}
      {tab === "members" ? <Members d={d} branch={branch} bName={bName} reload={load} initialQ={initialTab?.startsWith("members:q:") ? initialTab.slice(10) : ""} /> : null}
      {tab === "activities" ? <Activities d={d} branch={branch === "all" ? d.branches[0].id : branch} reload={load} /> : null}
    </>
  );
}

function Members({ d, branch, bName, reload, initialQ = "" }: { d: Data; branch: string; bName: (id: string) => string; reload: () => void; initialQ?: string }) {
  const [q, setQ] = useState(initialQ);
  const [showOff, setShowOff] = useState(false);
  const [sel, setSel] = useState<Member | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const list = d.members.filter((m) => (showOff ? !m.active : m.active) && (branch === "all" || m.branchId === branch) && (!q.trim() || `${m.name} ${m.phone}`.includes(q.trim())));
  const save = async () => {
    if (!sel) return;
    try {
      await post("/api/bnot/members", sel);
      setSel(null);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const exportXlsx = () => {
    const rows = [["שם", "טלפון", "סניף"], ...list.map((m) => [m.name, m.phone, bName(m.branchId)])];
    downloadBlob(buildXlsx([{ name: "משתתפות", rows, widths: [24, 16, 26] }]), "משתתפות בנות צילה.xlsx");
  };
  return (
    <>
      <div className="adm-toolbar">
        <input className="input adm-search" type="search" placeholder="חיפוש" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש משתתפת" />
        <button type="button" className="adm-chip" aria-pressed={showOff} onClick={() => setShowOff(!showOff)}>
          לא פעילות
        </button>
        <ExportBtn onClick={exportXlsx} />
      </div>
      {msg ? <div className="adm-alert adm-alert--error">{msg}</div> : null}
      <div className="adm-split">
        <div className="adm-list">
          {list.map((m) => (
            <SwipeRow
              key={m.id}
              phone={m.phone || undefined}
              waText={`שלום ${m.name}, `}
              tone={!m.active ? "grey" : m.phone ? "green" : "yellow"}
              current={sel?.id === m.id}
              onClick={() => setSel({ ...m })}
              actions={<IconActions phone={m.phone || undefined} waText={`שלום ${m.name}, `} />}
            >
              <span className="adm-row__title">{m.name}</span>
              <span />
              <span className="adm-row__sub">
                {m.phone || "אין טלפון"} · {bName(m.branchId)}
              </span>
            </SwipeRow>
          ))}
          {!list.length ? <div className="adm-panel adm-empty">אין משתתפות להצגה.</div> : null}
        </div>
        {sel ? (
          <section className="adm-panel adm-detail is-open" aria-label="כרטיס משתתפת">
            <div className="adm-panel__head">
              <h2>{sel.id ? sel.name : "משתתפת חדשה"}</h2>
              <button type="button" className="adm-icon-btn adm-sheet-back" aria-label="סגירה" onClick={() => setSel(null)}>
                <Icon name="close" />
              </button>
            </div>
            <ContactActions phone={sel.phone || undefined} waText={`שלום ${sel.name}, `} />
            <div className="adm-fields adm-fields--2">
              <label className="field">
                <span className="field__label">שם</span>
                <input className="input" value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">טלפון</span>
                <input className="input" type="tel" dir="ltr" style={{ textAlign: "right" }} value={sel.phone} onChange={(e) => setSel({ ...sel, phone: e.target.value })} />
              </label>
              <div className="field span-2">
                <span className="field__label">סניף</span>
                <Combo label="סניף" value={sel.branchId} onChange={(branchId) => setSel({ ...sel, branchId })} options={d.branches.map((b) => ({ id: b.id, label: b.name, sub: d.cities.find((c) => c.id === b.parentId)?.name }))} />
              </div>
              <label className="field span-2">
                <span className="field__label">הערות</span>
                <textarea className="textarea" value={sel.notes ?? ""} onChange={(e) => setSel({ ...sel, notes: e.target.value })} />
              </label>
              <label className="adm-toggle span-2">
                <input type="checkbox" checked={sel.active} onChange={(e) => setSel({ ...sel, active: e.target.checked })} />
                פעילה
              </label>
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn--sm" disabled={!sel.name.trim() || !sel.branchId} onClick={save}>
                <Icon name="check" /> שמירה
              </button>
            </div>
          </section>
        ) : (
          <div className="adm-panel adm-empty adm-detail-empty">
            <Icon name="users" />
          </div>
        )}
      </div>
      {!sel ? <Fab label="הוספת משתתפת" onClick={() => setSel({ id: "", name: "", phone: "", branchId: branch !== "all" ? branch : d.branches.length === 1 ? d.branches[0].id : "", active: true })} /> : null}
    </>
  );
}

function Activities({ d, branch, reload }: { d: Data; branch: string; reload: () => void }) {
  const acts = d.activities.filter((a) => a.branchId === branch);
  const [openId, setOpenId] = useState<string | null>(acts[0]?.id ?? null);
  const [form, setForm] = useState<{ date: string; title: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cur = acts.find((a) => a.id === openId) ?? null;
  const members = d.members.filter((m) => m.active && m.branchId === branch);

  const saveAct = async (a: Partial<Activity> & { branchId: string; date: string; title: string; present: string[] }) => {
    try {
      const r = await post<{ id: string }>("/api/bnot/activities", a);
      setOpenId(r.id);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    }
  };
  const toggle = (id: string) => {
    if (!cur) return;
    const present = cur.present.includes(id) ? cur.present.filter((x) => x !== id) : [...cur.present, id];
    saveAct({ ...cur, present });
  };
  const exportXlsx = () => {
    const sorted = [...acts].reverse();
    const rows = [["משתתפת", ...sorted.map((a) => `${dayLabel(a.date)} ${a.title}`), "הגיעה"], ...members.map((m) => [m.name, ...sorted.map((a) => (a.present.includes(m.id) ? "✓" : "✗")), sorted.filter((a) => a.present.includes(m.id)).length])];
    downloadBlob(buildXlsx([{ name: "נוכחות", rows }]), "פעילויות בנות צילה.xlsx");
  };

  return (
    <>
      {err ? <div className="adm-alert adm-alert--error">{err}</div> : null}
      <div className="adm-toolbar">
        <div className="adm-chips" style={{ flex: 1, marginBottom: 0 }}>
          {acts.slice(0, 30).map((a) => (
            <button key={a.id} type="button" className="adm-chip" aria-pressed={a.id === openId} onClick={() => setOpenId(a.id)}>
              {dayLabel(a.date)} · {a.title} <span className="adm-chip__n">{a.present.length}</span>
            </button>
          ))}
        </div>
        <ExportBtn onClick={exportXlsx} />
      </div>
      {form ? (
        <section className="adm-panel">
          <div className="adm-fields adm-fields--2">
            <label className="field">
              <span className="field__label">תאריך</span>
              <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">פעילות</span>
              <input className="input" value={form.title} placeholder="שיעור, ערב נשים, מפגש..." autoFocus onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn--sm"
              onClick={async () => {
                await saveAct({ branchId: branch, date: form.date, title: form.title, present: [] });
                setForm(null);
              }}
            >
              <Icon name="check" /> פתיחה
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm(null)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}
      {cur ? (
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              {dayLabel(cur.date)} · {cur.title}
            </h2>
            <button
              type="button"
              className="adm-icon-btn adm-icon-btn--danger"
              aria-label="מחיקת הפעילות"
              onClick={async () => {
                if (!window.confirm("למחוק את הפעילות?")) return;
                await del(`/api/bnot/activities/${cur.id}`);
                setOpenId(null);
                reload();
              }}
            >
              <Icon name="trash" />
            </button>
          </div>
          <div className="btn-row" style={{ marginBottom: 10 }}>
            <button type="button" className="btn btn--sm" onClick={() => saveAct({ ...cur, present: members.map((m) => m.id) })}>
              <Icon name="checkCircle" /> כולן הגיעו
            </button>
          </div>
          <div className="adm-att">
            {members.map((m) => {
              const on = cur.present.includes(m.id);
              return (
                <button key={m.id} type="button" className={`adm-att__btn${on ? " is-on" : " is-off"}`} onClick={() => toggle(m.id)} aria-pressed={on}>
                  <span className="adm-att__mark">
                    <Icon name={on ? "check" : "close"} />
                  </span>
                  <span className="adm-att__name">{m.name}</span>
                  <small />
                </button>
              );
            })}
            {!members.length ? <p className="muted">אין משתתפות בסניף. מוסיפים בלשונית "משתתפות".</p> : null}
          </div>
        </section>
      ) : !form ? (
        <div className="adm-panel adm-empty">אין עדיין פעילויות בסניף.</div>
      ) : null}
      {!form ? <Fab label="פעילות חדשה" onClick={() => setForm({ date: today(), title: "" })} /> : null}
    </>
  );
}
