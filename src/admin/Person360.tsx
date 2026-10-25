import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { api, post, type View } from "./api";
import { ContactActions } from "./components";

export type PersonKind = "avrech" | "member" | "mitch" | "submission";
type Timeline = { at:string; type:string; title:string; by:string };
type Person = {
  kind:PersonKind;id:string;name:string;phone:string;email:string;domain:"kollel"|"bnot"|null;
  branchId:string|null;branch:string;city:string;status:string;stage:string;source:string;notes:string;tags:string[];
  nextFollowUp:string|null;stats:{timeline:number};timeline:Timeline[];
};
type Ai = { provider:"openai"|"rules"; summary:string; suggestions:string[]; cleanText:string; warning?:string };

const fmt=(x:string)=>{
  const d=new Date(x.length===10?`${x}T12:00:00`:x);
  return Number.isNaN(d.getTime())?x:new Intl.DateTimeFormat("he-IL",{dateStyle:"medium",...(x.length>10?{timeStyle:"short" as const}:{})}).format(d);
};

export function Person360({kind,id,onClose,onGo}:{kind:PersonKind;id:string;onClose:()=>void;onGo:(v:View,tab?:string)=>void}){
  const [person,setPerson]=useState<Person|null>(null);
  const [ai,setAi]=useState<Ai|null>(null);
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{api<{person:Person}>(`/api/person/${kind}/${id}`).then((r)=>setPerson(r.person)).catch((e)=>setErr(e.message));},[kind,id]);
  if(err) return <div className="adm-person360-back" onClick={onClose}><section className="adm-person360" onClick={(e)=>e.stopPropagation()}><div className="adm-alert adm-alert--error">{err}</div></section></div>;
  if(!person) return <div className="adm-person360-back" onClick={onClose}><section className="adm-person360" onClick={(e)=>e.stopPropagation()}><p className="muted">טוען כרטיס 360°…</p></section></div>;
  const goTo=()=>{
    if(person.kind==="mitch") onGo(person.domain==="bnot"?"bnot":"kollel",`mitch:q:${person.name}`);
    else if(person.kind==="member") onGo("bnot",`members:q:${person.name}`);
    else if(person.kind==="avrech") onGo("kollel",`avrechim:q:${person.name}`);
    else onGo(person.domain==="bnot"?"isha":"inquiries");
    onClose();
  };
  const runAi=async()=>{
    setBusy(true);
    try{setAi(await post<Ai>("/api/smart/ai",{kind,id}));}catch(e){setErr(e instanceof Error?e.message:"שגיאה");}finally{setBusy(false);}
  };
  return <div className="adm-person360-back" role="dialog" aria-modal="true" aria-label={`כרטיס 360 של ${person.name}`} onClick={onClose}>
    <section className="adm-person360" onClick={(e)=>e.stopPropagation()}>
      <header className="adm-person360__head">
        <div className="adm-person360__avatar">{person.name.trim().charAt(0)||"?"}</div>
        <div><span className="adm-eyebrow">כרטיס 360°</span><h2>{person.name}</h2><p>{[person.city,person.branch,person.stage||person.status].filter(Boolean).join(" · ")}</p></div>
        <button type="button" className="adm-icon-btn" aria-label="סגירה" onClick={onClose}><Icon name="close"/></button>
      </header>
      <div className="adm-person360__contact"><ContactActions phone={person.phone||undefined} email={person.email||undefined} waText={`שלום ${person.name}, `}/><button type="button" className="btn btn--ghost btn--sm" onClick={goTo}><Icon name="edit"/> מעבר לניהול</button></div>
      <div className="adm-person360__facts">
        <div><span>סטטוס</span><strong>{person.status||"—"}</strong></div>
        <div><span>שלב</span><strong>{person.stage||"—"}</strong></div>
        <div><span>מקור</span><strong>{person.source||"—"}</strong></div>
        <div><span>אירועים מתועדים</span><strong>{person.stats.timeline}</strong></div>
        {person.nextFollowUp?<div><span>מעקב הבא</span><strong>{fmt(person.nextFollowUp)}</strong></div>:null}
      </div>
      {person.tags?.length?<div className="adm-roles">{person.tags.map((t)=><span className="adm-role" key={t}>{t}</span>)}</div>:null}
      {person.notes?<section className="adm-person360__note"><strong>הערות</strong><p>{person.notes}</p></section>:null}

      <section className="adm-person360__ai">
        <div className="adm-panel__head"><div><h3><Icon name="sparkle"/> עוזר חכם</h3><small>מסכם ומציע את הפעולה הבאה בלי לשלוח טלפון או מייל ל-AI.</small></div><button type="button" className="btn btn--sm" disabled={busy} onClick={runAi}>{busy?"מנתח…":ai?"רענון המלצה":"ניתוח והמלצה"}</button></div>
        {ai?<div className="adm-ai-result"><p>{ai.summary}</p><ul>{ai.suggestions.map((x,i)=><li key={i}>{x}</li>)}</ul>{ai.cleanText&&ai.cleanText!==person.notes?<div><strong>נוסח נקי:</strong><p>{ai.cleanText}</p></div>:null}{ai.warning?<small>{ai.warning}</small>:null}<span className="adm-ai-provider">{ai.provider==="openai"?"AI":"מנוע חוקים"}</span></div>:<p className="muted">לחיצה אחת לקבלת סיכום והמלצות פעולה לפי ההיסטוריה.</p>}
      </section>

      <section className="adm-person360__timeline">
        <div className="adm-panel__head"><h3>ציר זמן מלא</h3><span className="adm-section-count">{person.timeline.length}</span></div>
        {person.timeline.map((x,i)=><article key={i}><div className="adm-person360__time">{fmt(x.at)}</div><i/><div><strong>{x.type}</strong><p>{x.title}</p>{x.by?<small>{x.by}</small>:null}</div></article>)}
        {!person.timeline.length?<div className="adm-empty">אין עדיין היסטוריה מתועדת.</div>:null}
      </section>
    </section>
  </div>;
}
