import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, post, type OrgUnit, type View } from "../api";
import { useLive } from "../live";
import { waLink } from "../components";

type Approval = { id:string; kind:"mitchUpdate"|"mentor"; title:string; sub:string; at:string; text:string; photos:number; domain:string };
type FunnelRow = { label:string; value:number };
type Health = { id:string; name:string; city:string; domain:"kollel"|"bnot"; score:number; activities30:number; due:number; people:number; hasManager:boolean; reasons:string[] };
type Caller = { id:string; name:string; phone:string; branchId:string|null; load:number };
type Task = { id:string; type:string; priority:"high"|"normal"; title:string; sub:string; view:View; tab?:string };
type Overview = {
  approvals:Approval[];
  funnel:{bnot:FunnelRow[];kollel:FunnelRow[]};
  health:Health[];
  callers:{callers:Caller[];unassigned:number;total:number};
  tasks:Task[];
};
type BulkRow = { id:string; name:string; phone:string; branchId:string; domain:"kollel"|"bnot"; tags:string[]; nextFollowUp?:string|null };
type BulkData = { rows:BulkRow[]; branches:OrgUnit[] };

const fmt=(iso:string)=>new Intl.DateTimeFormat("he-IL",{dateStyle:"short",timeStyle:"short"}).format(new Date(iso));
const scoreTone=(n:number)=>n>=80?"green":n>=60?"yellow":"red";

export function SmartCenterView({ go, initialTab }: { go:(v:View,tab?:string)=>void; initialTab?:string }) {
  const [d,setD]=useState<Overview|null>(null);
  const [err,setErr]=useState("");
  const [tab,setTab]=useState(initialTab==="approvals"?"approvals":initialTab==="funnels"?"funnels":initialTab==="health"?"health":initialTab==="callers"?"callers":initialTab==="bulk"?"bulk":"overview");
  const load=useCallback(()=>api<Overview>("/api/smart/overview").then(setD).catch((e)=>setErr(e.message)),[]);
  useEffect(()=>{load();},[load]);
  useLive(["mitchUpdates","submissions","mitchazkim","bnotActivities","challahEvents","kollelAttendance","orgUnits","phoneUsers","callerAssignments","smartTasks"],load);

  if(err) return <div className="adm-alert adm-alert--error">{err}</div>;
  if(!d) return <p className="muted">טוען ניהול חכם…</p>;

  const urgent=d.tasks.filter((x)=>x.priority==="high").length;
  return (
    <div className="adm-smart">
      <div className="adm-head">
        <div>
          <span className="adm-eyebrow">המערכת עובדת בשבילכם</span>
          <h1>ניהול חכם</h1>
          <p>אישורים, משימות, אוטומציות, משפכים, בריאות סניפים וחלוקת טלפניות — ממקום אחד.</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={async()=>{await post("/api/smart/run",{});load();}}><Icon name="refresh"/> הרצת אוטומציות</button>
      </div>

      <section className="adm-smart-kpis">
        <button onClick={()=>setTab("overview")}><Icon name="alert"/><strong>{d.tasks.length}</strong><span>משימות פתוחות</span><small>{urgent} דחופות</small></button>
        <button onClick={()=>setTab("approvals")}><Icon name="checkCircle"/><strong>{d.approvals.length}</strong><span>ממתינים לאישור</span><small>מרכז אישורים</small></button>
        <button onClick={()=>setTab("health")}><Icon name="pin"/><strong>{d.health.filter((x)=>x.score<60).length}</strong><span>סניפים אדומים</span><small>דורשים התערבות</small></button>
        <button onClick={()=>setTab("callers")}><Icon name="phone"/><strong>{d.callers.unassigned}</strong><span>ללא טלפנית</span><small>{d.callers.callers.length} טלפניות פעילות</small></button>
      </section>

      <div className="adm-tabs-inline" role="tablist">
        {[
          ["overview","מה דורש טיפול"],["approvals","אישורים"],["funnels","משפכים"],["health","בריאות סניפים"],["callers","טלפניות"],["bulk","פעולות מרוכזות"],
        ].map(([id,label])=><button key={id} type="button" className="adm-chip" aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
      </div>

      {tab==="overview"?<Tasks tasks={d.tasks} go={go}/>:null}
      {tab==="approvals"?<Approvals rows={d.approvals} onChange={load}/>:null}
      {tab==="funnels"?<Funnels data={d.funnel}/>:null}
      {tab==="health"?<HealthPanel rows={d.health} go={go}/>:null}
      {tab==="callers"?<Callers data={d.callers} onChange={load}/>:null}
      {tab==="bulk"?<BulkPanel/>:null}
    </div>
  );
}

function Tasks({tasks,go}:{tasks:Task[];go:(v:View,tab?:string)=>void}){
  return <section className="adm-panel">
    <div className="adm-panel__head"><div><h2>מה דורש טיפול עכשיו</h2><p className="muted">המערכת יוצרת את הרשימה אוטומטית לפי הנתונים.</p></div><span className="adm-section-count">{tasks.length}</span></div>
    <div className="adm-smart-task-list">
      {tasks.map((t)=><button type="button" key={t.id} className={`adm-smart-task ${t.priority==="high"?"is-high":""}`} onClick={()=>go(t.view,t.tab)}>
        <span className="adm-smart-task__icon"><Icon name={t.type==="approval"?"checkCircle":t.type==="assignment"?"hands":"clock"}/></span>
        <span><strong>{t.title}</strong><small>{t.sub}</small></span>
        <Icon name="arrowLeft"/>
      </button>)}
      {!tasks.length?<div className="adm-empty-state"><Icon name="checkCircle"/><strong>אין כרגע צוואר בקבוק</strong><span>המערכת לא מזהה משימה חריגה שממתינה לטיפול.</span></div>:null}
    </div>
  </section>;
}

function Approvals({rows,onChange}:{rows:Approval[];onChange:()=>void}){
  const [busy,setBusy]=useState("");
  const act=async(x:Approval,action:"approve"|"reject")=>{
    setBusy(x.id);try{await post(`/api/smart/approvals/${x.kind}/${x.id}/${action}`,{});onChange();}finally{setBusy("");}
  };
  return <section className="adm-panel">
    <div className="adm-panel__head"><h2>מרכז אישורים</h2><span className="adm-section-count">{rows.length}</span></div>
    <div className="adm-approval-list">
      {rows.map((x)=><article key={x.id} className="adm-approval">
        <div className="adm-approval__head"><div><strong>{x.title}</strong><span>{x.sub}</span></div><small>{fmt(x.at)}</small></div>
        {x.text?<p>{x.text}</p>:null}
        {x.photos?<span className="adm-scope-chip"><Icon name="image"/> {x.photos} תמונות</span>:null}
        <div className="btn-row">
          <button type="button" className="btn btn--sm" disabled={busy===x.id} onClick={()=>act(x,"approve")}><Icon name="check"/> אישור</button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy===x.id} onClick={()=>act(x,"reject")}><Icon name="close"/> דחייה</button>
        </div>
      </article>)}
      {!rows.length?<div className="adm-empty">אין כרגע פריטים שממתינים לאישור.</div>:null}
    </div>
  </section>;
}

function Funnel({title,rows,tone}:{title:string;rows:FunnelRow[];tone:"teal"|"rose"}){
  const max=Math.max(1,...rows.map((x)=>x.value));
  return <section className="adm-panel adm-funnel">
    <h2>{title}</h2>
    <div className={`adm-funnel__rows adm-funnel__rows--${tone}`}>
      {rows.map((r,i)=><div className="adm-funnel__row" key={r.label}>
        <div className="adm-funnel__meta"><span>{r.label}</span><strong>{r.value}</strong></div>
        <div className="adm-funnel__track"><i style={{width:`${Math.max(5,(r.value/max)*100)}%`}}/></div>
        {i>0&&rows[i-1].value?<small>{Math.round((r.value/rows[i-1].value)*100)}% מהשלב הקודם</small>:<small>נקודת כניסה</small>}
      </div>)}
    </div>
  </section>;
}
function Funnels({data}:{data:Overview["funnel"]}){
  return <div className="adm-smart-two"><Funnel title="בנות צילה — משפך קשר והעמקה" rows={data.bnot} tone="rose"/><Funnel title="טללי ברכה — משפך התקדמות" rows={data.kollel} tone="teal"/></div>;
}

function HealthPanel({rows,go}:{rows:Health[];go:(v:View,tab?:string)=>void}){
  const [domain,setDomain]=useState<"all"|"bnot"|"kollel">("all");
  const list=rows.filter((x)=>domain==="all"||x.domain===domain);
  const avg=list.length?Math.round(list.reduce((n,x)=>n+x.score,0)/list.length):0;
  return <>
    <div className="adm-toolbar">
      <div className="adm-segmented">
        <button aria-pressed={domain==="all"} onClick={()=>setDomain("all")}>הכול</button>
        <button aria-pressed={domain==="kollel"} onClick={()=>setDomain("kollel")}>טללי ברכה</button>
        <button aria-pressed={domain==="bnot"} onClick={()=>setDomain("bnot")}>בנות צילה</button>
      </div>
      <span className="adm-scope-chip">ציון ממוצע: {avg}</span>
    </div>
    <div className="adm-health-grid">
      {list.map((x)=><button type="button" key={x.id} className={`adm-health adm-health--${scoreTone(x.score)}`} onClick={()=>go(x.domain==="bnot"?"bnot":"kollel")}>
        <div className="adm-health__score">{x.score}</div>
        <div className="adm-health__body"><strong>{x.name} · {x.city}</strong><span>{x.activities30} פעילויות ב-30 יום · {x.people} אנשים · {x.due} מעקבים באיחור</span><small>{x.reasons.length?x.reasons.join(" · "):"הכול נראה תקין"}</small></div>
        <Icon name="arrowLeft"/>
      </button>)}
    </div>
  </>;
}

function Callers({data,onChange}:{data:Overview["callers"];onChange:()=>void}){
  const [busy,setBusy]=useState(false);
  return <section className="adm-panel">
    <div className="adm-panel__head">
      <div><h2>איזון עומס טלפניות</h2><p className="muted">החלוקה מתבצעת רק בין משתמשות בתפקיד “טלפנית - בנות צילה”.</p></div>
      <button type="button" className="btn btn--sm" disabled={busy||!data.unassigned} onClick={async()=>{setBusy(true);try{await post("/api/smart/callers/auto-assign",{});onChange();}finally{setBusy(false);}}}><Icon name="sparkle"/> חלוקה אוטומטית</button>
    </div>
    <div className="adm-caller-summary"><strong>{data.unassigned}</strong><span>נשים שעדיין ללא טלפנית מתוך {data.total}</span></div>
    <div className="adm-workload">
      {data.callers.map((c)=>{
        const max=Math.max(1,...data.callers.map((x)=>x.load));
        return <div key={c.id} className="adm-workload__row"><span>{c.name}</span><i><b style={{width:`${Math.max(5,c.load/max*100)}%`}}/></i><strong>{c.load}</strong></div>;
      })}
      {!data.callers.length?<div className="adm-empty">עדיין אין משתמשות בתפקיד טלפנית. מוסיפים אותן ב“משתמשים והרשאות”.</div>:null}
    </div>
  </section>;
}

function BulkPanel(){
  const [kind,setKind]=useState<"member"|"mitch">("member");
  const [d,setD]=useState<BulkData|null>(null);
  const [q,setQ]=useState("");
  const [branch,setBranch]=useState("all");
  const [sel,setSel]=useState<Set<string>>(new Set());
  const [action,setAction]=useState<"tag"|"branch"|"followup"|"message">("tag");
  const [value,setValue]=useState("");
  const [message,setMessage]=useState("");
  const [channel,setChannel]=useState<"whatsapp"|"sms">("whatsapp");
  const [wa,setWa]=useState<{name:string;phone:string}[]>([]);
  const [msg,setMsg]=useState("");
  const load=useCallback(()=>api<BulkData>(`/api/smart/bulk?kind=${kind}`).then((r)=>{setD(r);setSel(new Set());}),[kind]);
  useEffect(()=>{load();},[load]);
  const list=useMemo(()=>(d?.rows||[]).filter((x)=>(branch==="all"||x.branchId===branch)&&(!q.trim()||`${x.name} ${x.phone}`.includes(q.trim()))),[d,branch,q]);
  if(!d) return <p className="muted">טוען…</p>;
  const allSelected=list.length>0&&list.every((x)=>sel.has(x.id));
  const run=async()=>{
    const ids=[...sel]; if(!ids.length)return;
    try{
      const body:any={kind,ids,action,value};
      if(action==="message"){body.text=message;body.channel=channel;}
      const r=await post<any>("/api/smart/bulk",body);
      if(action==="message"&&channel==="whatsapp"){setWa(r.recipients||[]);setMsg(`הוכנו ${r.recipients?.length||0} נמענים`);}
      else setMsg(action==="message"?`נשלח ל-${r.sent||0} נמענים`:`עודכנו ${r.changed||0} רשומות`);
      load();
    }catch(e){setMsg(e instanceof Error?e.message:"שגיאה");}
  };
  return <section className="adm-panel">
    <div className="adm-panel__head"><div><h2>פעולות מרוכזות</h2><p className="muted">בוחרים אנשים ואז מבצעים פעולה אחת על כולם.</p></div><span className="adm-section-count">{sel.size}</span></div>
    <div className="adm-bulk-tools">
      <div className="adm-segmented"><button aria-pressed={kind==="member"} onClick={()=>setKind("member")}>משתתפות</button><button aria-pressed={kind==="mitch"} onClick={()=>setKind("mitch")}>מתחזקים/ות</button></div>
      <input className="input" type="search" placeholder="חיפוש" value={q} onChange={(e)=>setQ(e.target.value)}/>
      <select className="select" value={branch} onChange={(e)=>setBranch(e.target.value)}><option value="all">כל הסניפים</option>{d.branches.map((b)=><option value={b.id} key={b.id}>{b.name}</option>)}</select>
    </div>
    <label className="adm-bulk-all"><input type="checkbox" checked={allSelected} onChange={(e)=>setSel(e.target.checked?new Set(list.map((x)=>x.id)):new Set())}/> בחירת כל {list.length} המוצגים</label>
    <div className="adm-bulk-list">
      {list.slice(0,300).map((x)=><label key={x.id}><input type="checkbox" checked={sel.has(x.id)} onChange={(e)=>setSel((prev)=>{const n=new Set(prev);e.target.checked?n.add(x.id):n.delete(x.id);return n;})}/><span><strong>{x.name}</strong><small>{x.phone}{x.tags?.length?` · ${x.tags.join(", ")}`:""}</small></span></label>)}
    </div>
    <div className="adm-bulk-action">
      <select className="select" value={action} onChange={(e)=>{setAction(e.target.value as typeof action);setWa([]);}}>
        <option value="tag">הוספת תגית</option><option value="branch">העברה לסניף</option>{kind==="mitch"?<option value="followup">קביעת מעקב</option>:null}<option value="message">שליחת הודעה</option>
      </select>
      {action==="branch"?<select className="select" value={value} onChange={(e)=>setValue(e.target.value)}><option value="">בחרו סניף</option>{d.branches.map((b)=><option value={b.id} key={b.id}>{b.name}</option>)}</select>:null}
      {action==="tag"?<input className="input" placeholder="שם תגית" value={value} onChange={(e)=>setValue(e.target.value)}/>:null}
      {action==="followup"?<input className="input" type="date" value={value} onChange={(e)=>setValue(e.target.value)}/>:null}
      {action==="message"?<>
        <select className="select" value={channel} onChange={(e)=>setChannel(e.target.value as typeof channel)}><option value="whatsapp">וואטסאפ</option><option value="sms">SMS</option></select>
        <textarea className="textarea" placeholder="נוסח הודעה" value={message} onChange={(e)=>setMessage(e.target.value)}/>
      </>:null}
      <button type="button" className="btn btn--sm" disabled={!sel.size||(action!=="message"&&!value)||(action==="message"&&!message.trim())} onClick={run}><Icon name="check"/> ביצוע על {sel.size}</button>
    </div>
    {msg?<div className="adm-alert adm-alert--info">{msg}</div>:null}
    {wa.length?<div className="adm-wa-batch"><strong>פתיחת WhatsApp לנמענים:</strong>{wa.slice(0,100).map((r)=><a key={r.phone} className="btn btn--ghost btn--sm" target="_blank" rel="noopener noreferrer" href={waLink(r.phone,message)}><Icon name="whatsapp"/>{r.name||r.phone}</a>)}</div>:null}
  </section>;
}
