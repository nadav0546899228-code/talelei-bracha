/** מבנה ארגוני: ארצי -> אזור -> עיר -> סניף */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api, del, DOMAIN_LABELS, post, type Domain, type Me, type OrgUnit } from "../api";
import type { Avrech } from "../kollelCalc";
import { useOrg, type OrgPerson } from "../org";
import { PhoneUsersPanel } from "./PhoneUsersPanel";
import { Fab, IconActions } from "../components";
import { useLive } from "../live";

type EditUnit={id?:string;type:"region"|"city"|"branch";name:string;parentId:string|null};

export function OrgView({ me, domain }: { me: Me; domain: Domain }) {
  const { org, reload } = useOrg();
  useLive(["orgUnits", "users", "phoneUsers"], reload);
  const roles = me.user.roles;
  const seesAll = roles.includes("developer") || roles.includes("ceo") || roles.includes("chief_coordinator");
  const canRegion = seesAll || roles.includes(`${domain}_region` as never);
  const [avrechim, setAvrechim] = useState<Avrech[]>([]);
  const [edit, setEdit] = useState<EditUnit | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (domain==="kollel" && me.user.views.includes("kollel")) api<{ avrechim: Avrech[] }>("/api/kollel/overview").then((r) => setAvrechim(r.avrechim)).catch(() => undefined);
  }, [me.user.views,domain]);

  const regions=useMemo(()=>(org?.regions??[]).filter((x)=>x.domain===domain),[org,domain]);
  const cities=useMemo(()=>(org?.cities??[]).filter((x)=>x.domain===domain),[org,domain]);
  const branches=useMemo(()=>(org?.branches??[]).filter((x)=>x.domain===domain),[org,domain]);
  const people=org?.people??[];
  const regionPeople=(id:string)=>people.filter((p)=>p.roles.includes(`${domain}_region` as never)&&p.scope?.[domain]?.regionId===id);
  const cityPeople=(id:string)=>people.filter((p)=>p.roles.includes(`${domain}_city` as never)&&p.scope?.[domain]?.cityId===id);
  const branchPeople=(id:string)=>people.filter((p)=>p.roles.includes(`${domain}_branch` as never)&&p.scope?.[domain]?.branchId===id);
  const chiefs=people.filter((p)=>p.roles.includes("chief_coordinator"));

  const activate=(level:"region"|"city"|"branch",id:string)=>{
    try{
      const all=JSON.parse(localStorage.getItem("tb-active-org-scope")||"{}");
      all[domain]={level,id};
      localStorage.setItem("tb-active-org-scope",JSON.stringify(all));
    }catch{/* מקומי בלבד */}
    window.location.reload();
  };

  const save=async()=>{
    if(!edit)return;
    setMsg(null);
    try{
      await post("/api/org/units",{...edit,domain});
      setEdit(null);await reload();
    }catch(e){setMsg({ok:false,text:e instanceof Error?e.message:"שגיאה"});}
  };
  const remove=async(u:OrgUnit)=>{
    const label=u.type==="region"?"האזור":u.type==="city"?"העיר":"הסניף";
    if(!window.confirm(`למחוק את ${label} ${u.name}?`))return;
    try{await del(`/api/org/units/${u.id}`);await reload();}
    catch(e){setMsg({ok:false,text:e instanceof Error?e.message:"שגיאה"});}
  };
  const who=(list:OrgPerson[],empty:string)=>list.length?(
    <div className="adm-org-people">{list.map((p)=><div key={p.id} className="adm-org-person">
      <span><strong>{p.name||p.email}</strong><small>{p.email||p.phone}</small></span>
      <IconActions phone={p.phone||undefined} email={p.email||undefined} waText={`שלום ${p.name}, `}/>
    </div>)}</div>
  ):<span className="adm-missing">{empty}</span>;

  if(!org)return <p className="muted">טוען…</p>;

  const editTitle=edit?.type==="region"?"אזור":edit?.type==="city"?"עיר":"סניף";
  return <>
    <div className="adm-head">
      <div><span className="adm-eyebrow">{DOMAIN_LABELS[domain]}</span><h1>המבנה הארגוני</h1><p>רכז ארצי → אזור → עיר → סניף. לחיצה על “כניסה לתצוגה” מצמצמת את כל המערכת לאותה רמה.</p></div>
    </div>

    {seesAll?<section className="adm-panel adm-org-national">
      <div className="adm-panel__head"><div><span className="adm-org-level">ארצי</span><h2>{domain==="bnot"?"רכזת ארצית":"רכז ארצי"}</h2></div><span className="adm-scope-chip">כל הארץ</span></div>
      {who(chiefs,"עדיין לא הוגדר רכז ארצי")}
    </section>:null}

    <div className="adm-toolbar">
      {seesAll?<button type="button" className="btn btn--sm" onClick={()=>setEdit({type:"region",name:"",parentId:null})}><Icon name="plus"/> אזור</button>:null}
      {canRegion&&regions.length?<button type="button" className="btn btn--ghost btn--sm" onClick={()=>setEdit({type:"city",name:"",parentId:regions[0].id})}><Icon name="plus"/> עיר</button>:null}
    </div>

    {edit?<section className="adm-panel adm-org-editor">
      <h2>{edit.id?`עריכת ${editTitle}`:`${editTitle} חדש`}</h2>
      <div className="adm-fields adm-fields--2">
        <label className="field"><span className="field__label">שם {editTitle}</span><input className="input" autoFocus value={edit.name} onChange={(e)=>setEdit({...edit,name:e.target.value})}/></label>
        {edit.type==="city"?<label className="field"><span className="field__label">אזור</span><select className="select" value={edit.parentId||""} onChange={(e)=>setEdit({...edit,parentId:e.target.value})}>{regions.map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>:null}
        {edit.type==="branch"?<label className="field"><span className="field__label">עיר</span><select className="select" value={edit.parentId||""} onChange={(e)=>setEdit({...edit,parentId:e.target.value})}>{regions.map((reg)=><optgroup key={reg.id} label={reg.name}>{cities.filter((c)=>c.parentId===reg.id).map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}</select></label>:null}
      </div>
      <div className="btn-row"><button type="button" className="btn btn--sm" disabled={!edit.name.trim()||((edit.type==="city"||edit.type==="branch")&&!edit.parentId)} onClick={save}><Icon name="check"/> שמירה</button><button type="button" className="btn btn--ghost btn--sm" onClick={()=>setEdit(null)}>ביטול</button></div>
    </section>:null}
    {msg?<div className={`adm-alert ${msg.ok?"adm-alert--ok":"adm-alert--error"}`}>{msg.text}</div>:null}

    <div className="adm-org-tree">
      {regions.map((reg)=>{
        const regCities=cities.filter((c)=>c.parentId===reg.id);
        const rp=regionPeople(reg.id);
        return <section key={reg.id} className="adm-panel adm-org-region">
          <div className="adm-org-node adm-org-node--region">
            <span className="adm-org-node__icon"><Icon name="globe"/></span>
            <div><span className="adm-org-level">אזור</span><h2>{reg.name}</h2><small>{regCities.length} ערים · {regCities.reduce((n,c)=>n+branches.filter((b)=>b.parentId===c.id).length,0)} סניפים</small></div>
            <div className="adm-org-node__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={()=>activate("region",reg.id)}><Icon name="eye"/> כניסה לתצוגה</button>
              {seesAll?<button type="button" className="adm-icon-btn" onClick={()=>setEdit({id:reg.id,type:"region",name:reg.name,parentId:null})}><Icon name="edit"/></button>:null}
              {seesAll?<button type="button" className="adm-icon-btn adm-icon-btn--danger" onClick={()=>remove(reg)}><Icon name="trash"/></button>:null}
            </div>
          </div>
          <div className="adm-org-manager"><strong>{domain==="bnot"?"רכזת האזור":"רכז האזור"}:</strong>{who(rp,"לא הוגדר")}</div>

          <div className="adm-org-cities">
            {regCities.map((city)=>{
              const bs=branches.filter((b)=>b.parentId===city.id);
              return <section key={city.id} className="adm-org-city">
                <div className="adm-org-node adm-org-node--city">
                  <span className="adm-org-node__icon"><Icon name="pin"/></span>
                  <div><span className="adm-org-level">עיר</span><h3>{city.name}</h3><small>{bs.length} סניפים</small></div>
                  <div className="adm-org-node__actions">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={()=>activate("city",city.id)}><Icon name="eye"/> כניסה</button>
                    {canRegion?<button type="button" className="adm-icon-btn" onClick={()=>setEdit({id:city.id,type:"city",name:city.name,parentId:city.parentId})}><Icon name="edit"/></button>:null}
                    {seesAll?<button type="button" className="adm-icon-btn adm-icon-btn--danger" onClick={()=>remove(city)}><Icon name="trash"/></button>:null}
                  </div>
                </div>
                <div className="adm-org-manager"><strong>{domain==="bnot"?"רכזת העיר":"רכז העיר"}:</strong>{who(cityPeople(city.id),"לא הוגדר")}</div>

                <div className="adm-org-branches">
                  {bs.map((b)=>{
                    const mgrs=branchPeople(b.id);
                    const count=avrechim.filter((a)=>a.active&&a.branchId===b.id).length;
                    return <div key={b.id} className={`adm-org-branch ${mgrs.length?"has-manager":"no-manager"}`}>
                      <span className="adm-org-node__icon"><Icon name="home"/></span>
                      <div><span className="adm-org-level">סניף</span><strong>{b.name}</strong><small>{domain==="bnot"?(mgrs.length?`מנהלת: ${mgrs.map((x)=>x.name).join(", ")}`:"ללא מנהלת"):`${count} אברכים · ${mgrs.length?`מנהל: ${mgrs.map((x)=>x.name).join(", ")}`:"ללא מנהל"}`}</small></div>
                      <div className="adm-org-node__actions">
                        {mgrs[0]?<IconActions phone={mgrs[0].phone||undefined} email={mgrs[0].email||undefined} waText={`שלום ${mgrs[0].name}, `}/>:null}
                        <button type="button" className="btn btn--ghost btn--sm" onClick={()=>activate("branch",b.id)}><Icon name="eye"/> כניסה</button>
                        <button type="button" className="adm-icon-btn" onClick={()=>setEdit({id:b.id,type:"branch",name:b.name,parentId:b.parentId})}><Icon name="edit"/></button>
                        {seesAll?<button type="button" className="adm-icon-btn adm-icon-btn--danger" onClick={()=>remove(b)}><Icon name="trash"/></button>:null}
                      </div>
                    </div>;
                  })}
                  {!bs.length?<p className="muted">אין עדיין סניפים בעיר.</p>:null}
                </div>
                <button type="button" className="adm-org-add-child" onClick={()=>setEdit({type:"branch",name:"",parentId:city.id})}><Icon name="plus"/> הוספת סניף בעיר {city.name}</button>
              </section>;
            })}
            {!regCities.length?<p className="muted">אין עדיין ערים באזור.</p>:null}
          </div>
        </section>;
      })}
      {!regions.length?<div className="adm-panel adm-empty">{seesAll?"מתחילים בהוספת אזור. לאחר מכן מוסיפים ערים וסניפים.":"לא הוגדר לך מבנה ארגוני. יש לפנות לרכז הארצי."}</div>:null}
    </div>

    {!edit&&canRegion&&regions.length?<Fab label="הוספת עיר" onClick={()=>setEdit({type:"city",name:"",parentId:regions[0].id})}/>:null}
    <div style={{marginTop:20}}><PhoneUsersPanel me={me} org={org} onChange={reload} title="רכזים, מנהלי סניפים וטלפניות"/></div>
  </>;
}
